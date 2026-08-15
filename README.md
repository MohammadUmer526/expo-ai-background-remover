# Background Remover

On-device background removal for React Native. Pick a photo, get a transparent cutout — no server, no upload, no per-image cost.

Inference runs locally through [ExecuTorch](https://github.com/software-mansion/react-native-executorch), and compositing is done on the GPU with [Skia](https://github.com/Shopify/react-native-skia). After the model is fetched on first launch, the app makes no network calls at all.


## How it works

The whole pipeline lives in [`app/index.tsx`](app/index.tsx):

1. **Pick** — `expo-image-picker` returns a local image URI.
2. **Decode** — Skia decodes it and `readPixels()` yields a flat RGBA byte buffer.
3. **Segment** — `model.forward(uri)` returns an `ARGMAX` mask, one class index per pixel, at full source resolution.
4. **Composite** — walk the mask and build a new RGBA buffer: keep the pixel where the class is `SELFIE`, write alpha `0` where it's `BACKGROUND`.
5. **Render** — `Skia.Image.MakeImage()` wraps the buffer and draws it to a `<Canvas>`.

The mask uses `SelfieSegmentationLabel`, where `SELFIE = 0` and `BACKGROUND = 1`:

```ts
const mask = resultImage.ARGMAX;
const rgba = new Uint8Array(mask.length * 4);

for (let i = 0; i < mask.length; i++) {
  const base = i * 4;
  if (mask[i] !== 0) {
    // BACKGROUND -> fully transparent
    rgba[base] = rgba[base + 1] = rgba[base + 2] = rgba[base + 3] = 0;
  } else {
    rgba[base] = originalPixels[base];
    rgba[base + 1] = originalPixels[base + 1];
    rgba[base + 2] = originalPixels[base + 2];
    rgba[base + 3] = 255;
  }
}
```

Because the mask comes back at source resolution, `mask.length * 4 === originalPixels.length` — the buffers line up with no resampling step.

## Stack

|              |                                                 |
| ------------ | ----------------------------------------------- |
| Expo SDK     | 54 (New Architecture enabled)                   |
| React Native | 0.81.5 / React 19.1.0                           |
| Inference    | `react-native-executorch` — selfie segmentation |
| Rendering    | `@shopify/react-native-skia`                    |
| Routing      | `expo-router`, typed routes                     |
| Language     | TypeScript                                      |

## Running it

This app uses native modules, so **it will not run in Expo Go** — you need a development build.

```bash
pnpm install          # or npm install

pnpm ios              # npx expo run:ios
pnpm android          # npx expo run:android
```

Requirements: Node 18+, and Xcode 16+ for iOS (deployment target is 17.0).

The segmentation model downloads on first launch — the UI shows progress and keeps the picker disabled until `model.isReady`.

### Signing

[`app.json`](app.json) pins `ios.appleTeamId` and `owner` to my accounts. Change both to your own before building:

```json
"owner": "<your-expo-account>",
"ios": {
  "appleTeamId": "<YOUR_TEAM_ID>"
}
```

## Known limitations

Honest list — this is a demo of the technique, not a finished product.

- **HEIC input can crash.** iPhone photos are HEIC by default, and if `MakeImageFromEncoded` returns `null`, the `originalPixels` read throws. Needs a null guard plus a decode fallback.
- **No export.** The cutout renders to a canvas but can't be saved or shared yet.
- **Channel order is assumed.** `readPixels()` returns the image's native layout, which on iOS is often BGRA, while the output buffer is built as `RGBA_8888`. If colors look swapped, that's why.
- **Single subject works best.** The selfie model is trained for one foreground person; crowds and non-human subjects degrade sharply.
- **Simulator inference is slow.** ExecuTorch falls back to CPU there. Real timings need a physical device.

## Credits

Built on [`react-native-executorch`](https://github.com/software-mansion/react-native-executorch) and [`react-native-skia`](https://github.com/Shopify/react-native-skia).

## License

MIT
