import {
  AlphaType,
  Canvas,
  ColorType,
  Skia,
  Image as SkiaImage,
} from "@shopify/react-native-skia";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Alert, Button, Image, StyleSheet, Text, View } from "react-native";
import {
  initExecutorch,
  models,
  useSemanticSegmentation,
} from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";

initExecutorch({
  resourceFetcher: ExpoResourceFetcher,
});

export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [skiaImage, setSkiaImage] = useState(null);

  const model = useSemanticSegmentation({
    model: models.semantic_segmentation.selfie_segmentation(),
  });

  const pickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        "Permission required",
        "Permission to access the media library is required.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    const width = result.assets[0].width;
    const height = result.assets[0].height;

    console.log(
      "picker dims:",
      result.assets[0].width,
      result.assets[0].height,
      result.assets[0].width * result.assets[0].height,
    );

    const uri = result.assets[0].uri;
    setImage(uri);

    const imageData = await Skia.Data.fromURI(uri);
    const skiaImage = Skia.Image.MakeImageFromEncoded(imageData);
    const originalPixels = skiaImage?.readPixels();
    console.log("originalPixels:", originalPixels?.length);

    if (!model.isReady) {
      Alert.alert(
        "Model not ready",
        "The segmentation model is still loading.",
      );
      return;
    }

    try {
      const resultImage = await model.forward(uri);
      const mask = resultImage.ARGMAX;

      // Build an RGBA byte buffer: one mask value -> 4 numbers (R, G, B, A).
      const rgba = new Uint8Array(mask.length * 4);
      for (let i = 0; i < mask.length; i++) {
        const base = i * 4;
        if (mask[i] !== 0) {
          // BACKGROUND -> fully transparent
          rgba[base] = 0;
          rgba[base + 1] = 0;
          rgba[base + 2] = 0;
          rgba[base + 3] = 0;
        } else {
          rgba[base] = originalPixels[base];
          rgba[base + 1] = originalPixels[base + 1];
          rgba[base + 2] = originalPixels[base + 2];
          rgba[base + 3] = 255;
        }
      }
      const data = Skia.Data.fromBytes(rgba);
      const img = Skia.Image.MakeImage(
        {
          width,
          height,
          alphaType: AlphaType.Unpremul,
          colorType: ColorType.RGBA_8888,
        },
        data,
        width * 4, // stride = real width × 4
      );
      setSkiaImage(img);

      console.log("rgba length:", rgba.length);
      console.log("is 4x mask:", rgba.length === mask.length * 4);
      // console.log("rgba values:", rgba);
    } catch (error) {
      console.error(error);
      Alert.alert("Segmentation failed", String(error));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Background Remover</Text>
      <Text style={styles.subtitle}>
        Pick an image to remove its background.
      </Text>

      {!model.isReady && (
        <Text style={styles.subtitle}>
          Loading model… {Math.round(model.downloadProgress * 100)}%
        </Text>
      )}

      <Button
        title="Pick an image from camera roll"
        onPress={pickImage}
        disabled={!model.isReady || model.isGenerating}
      />

      {model.isGenerating && <Text style={styles.subtitle}>Processing…</Text>}

      {image && <Image source={{ uri: image }} style={styles.image} />}
      {skiaImage && (
        <Canvas style={{ width: 300, height: 300, backgroundColor: "#ddd" }}>
          <SkiaImage
            image={skiaImage}
            x={0}
            y={0}
            width={300}
            height={300}
            fit="contain"
          />
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    textAlign: "center",
  },
  image: {
    width: 300,
    height: 225,
    borderRadius: 12,
    marginTop: 16,
  },
});
