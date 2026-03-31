---
name: remotion
description: Remotion - Video creation in React. Animations, compositions, audio, captions, transitions, 3D, and rendering.
---

# /remotion — יצירת סרטונים עם Remotion

## ⚠️ כלל ברזל #0 — RTL הורס את ה-Player (ALWAYS dir="ltr")

**הבעיה:** בפרויקטי RTL, `dir="rtl"` עובר בירושה לתוך ה-DOM של Remotion Player.
ה-Player משתמש ב-`position: absolute` + `transform: scale()` — כשה-direction הוא `rtl`, העיגון עובר לימין ודוחף את התוכן המכווץ **החוצה מהמסגרת** (נחתך משמאל).

**הפתרון:** תמיד `dir="ltr"` על הקונטיינר שעוטף את ה-Player:

```tsx
// ✅ חובה בכל שימוש ב-Remotion Player באתר RTL
<div dir="ltr" className="...">
  <Player
    component={MyVideo}
    durationInFrames={150}
    fps={30}
    compositionWidth={1920}
    compositionHeight={1080}
    style={{ width: "100%" }}
  />
</div>

// ❌ בלי dir="ltr" — הווידאו נחתך ונדחף החוצה מהמסגרת
<div className="...">
  <Player ... />
</div>
```

> **למה זה קורה:** RTL הופך את עיגון ה-`position: absolute` מ-`left` ל-`right`. ה-scale transform מחושב ממרכז/שמאל — אז הפלייר "בורח" לצד שמאל מחוץ לקונטיינר.

---

## כלל ברזל #1 — useCurrentFrame() שולט על הכל

```tsx
// ✅ נכון - הכל מונע על ידי frame
const frame = useCurrentFrame();
const { fps } = useVideoConfig();
const opacity = interpolate(frame, [0, fps], [0, 1], { extrapolateRight: "clamp" });

// ❌ אסור לחלוטין
// CSS transition-*, animate-*, Tailwind animate-*, useFrame() מ-R3F
// כל animation חיצונית שלא עוברת דרך useCurrentFrame()
```

---

## Bootstrap

```bash
npx create-video@latest
# או הוסף לפרויקט קיים:
npx remotion add @remotion/transitions
npx remotion add @remotion/google-fonts
npx remotion add @remotion/captions
npx remotion add @remotion/media
```

---

## Compositions

```tsx
// Root.tsx
<Composition
  id="MyVideo"
  component={MyVideo}
  durationInFrames={150}   // 5 שניות ב-30fps
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{ title: "Hello" }}
/>

// Props — תמיד type (לא interface), JSON-serializable
type Props = {
  title: string;
  color: string;
};

// Zod schema (לפרמטרים בסטודיו)
import { z } from "zod";
import { zColor } from "@remotion/zod-types";
const Schema = z.object({
  title: z.string(),
  color: zColor(),
});
<Composition schema={Schema} ... />

// calculateMetadata — עבור משך דינמי
const calcMetadata: CalculateMetadataFunction<Props> = async ({ props, abortSignal }) => {
  const duration = await getAudioDurationInSeconds(staticFile("voice.mp3"));
  return { durationInFrames: Math.ceil(duration * 30) };
};
<Composition calculateMetadata={calcMetadata} ... />
```

---

## Animations

### interpolate (ליניארי)
```tsx
const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

### spring (אורגני)
```tsx
import { spring } from "remotion";
const { fps } = useVideoConfig();

// Smooth
const scale = spring({ frame, fps, config: { damping: 200 } });

// Snappy
const x = spring({ frame, fps, config: { damping: 20, stiffness: 200 } });

// Bouncy
const y = spring({ frame, fps, config: { damping: 8 } });

// עם עיכוב
const late = spring({ frame, fps, delay: fps * 0.5, durationInFrames: fps });
```

### Easing
```tsx
import { interpolate, Easing } from "remotion";
const smooth = interpolate(frame, [0, 30], [0, 1], {
  easing: Easing.bezier(0.25, 0.1, 0.25, 1),
  extrapolateRight: "clamp",
});
// Presets: Easing.in(Easing.quad), Easing.out(Easing.sin), Easing.inOut(Easing.exp)
```

---

## Sequencing

```tsx
import { Sequence, Series } from "remotion";

// Sequence — מתחיל ב-frame מסויים
<Sequence from={fps * 1} durationInFrames={fps * 3}>
  <MyComponent /> {/* useCurrentFrame() מחזיר 0 כאן */}
</Sequence>

// Series — רצף אוטומטי
<Series>
  <Series.Sequence durationInFrames={fps * 2}><Scene1 /></Series.Sequence>
  <Series.Sequence durationInFrames={fps * 3}><Scene2 /></Series.Sequence>
</Series>

// Trim start: from שלילי
<Sequence from={-fps * 0.5} durationInFrames={fps * 3}>
  {/* מתחיל 15 frames לתוך הcomponent */}
</Sequence>
```

---

## Transitions

```tsx
import { TransitionSeries } from "@remotion/transitions";
import { fade, slide, wipe, flip } from "@remotion/transitions/fade"; // etc.
import { springTiming } from "@remotion/transitions";

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={fps * 3}>
    <Scene1 />
  </TransitionSeries.Sequence>

  <TransitionSeries.Transition
    presentation={fade()}
    timing={springTiming({ config: { damping: 200 } })}
  />

  <TransitionSeries.Sequence durationInFrames={fps * 3}>
    <Scene2 />
  </TransitionSeries.Sequence>

  {/* אפקט מעל נקודת חיתוך - לא משנה את המשך */}
  <TransitionSeries.Overlay durationInFrames={fps}>
    <LightLeak durationInFrames={fps} seed={1} />
  </TransitionSeries.Overlay>
</TransitionSeries>

// ⚠️ המשך כולל קצר יותר מסכום ה-sequences (transitions חופפים)
```

---

## Assets

```tsx
import { Img, Video, Audio } from "@remotion/media"; // או מ-"remotion"
import { staticFile } from "remotion";

// תמיד staticFile() לקבצים ב-public/
<Img src={staticFile("photo.jpg")} style={{ width: "100%", objectFit: "cover" }} />

// URL חיצוני — ישירות, בלי staticFile()
<Img src="https://example.com/photo.jpg" />

// Video
<Video src={staticFile("clip.mp4")} style={{ width: "100%" }}
  trimBefore={2 * fps} trimAfter={10 * fps} />

// Audio
<Audio src={staticFile("music.mp3")} volume={0.5}
  volume={(f) => interpolate(f, [0, fps], [0, 1], { extrapolateRight: "clamp" })} />

// GIF
import { AnimatedImage } from "remotion";
<AnimatedImage src={staticFile("anim.gif")} width={400} height={300} fit="contain" />
```

---

## טקסט ו-Captions

### Typewriter
```tsx
const frame = useCurrentFrame();
const text = "Hello World";
const charsToShow = Math.floor(frame / 2);
<div>{text.slice(0, charsToShow)}</div>
```

### TikTok-style Captions
```tsx
import { createTikTokStyleCaptions } from "@remotion/captions";
const { pages } = createTikTokStyleCaptions({
  captions,
  combineTokensWithinMilliseconds: 1200,
});
{pages.map((page, i) => (
  <Sequence
    key={i}
    from={Math.floor((page.startMs / 1000) * fps)}
    durationInFrames={Math.ceil(((page.endMs - page.startMs) / 1000) * fps)}
  >
    <CaptionPage page={page} />
  </Sequence>
))}
```

### Voiceover עם ElevenLabs
```tsx
// 1. Generate MP3 → public/voiceover/
// 2. calculateMetadata מודד אורך
import { getAudioDurationInSeconds } from "@remotion/media-utils";
const duration = await getAudioDurationInSeconds(staticFile(`voiceover/${id}.mp3`));
return { durationInFrames: Math.ceil(duration * fps) };
// Model: eleven_multilingual_v2
```

---

## פונטים

```tsx
// Google Fonts
import { loadFont } from "@remotion/google-fonts/Rubik";
const { waitUntilDone } = loadFont("normal", { weights: ["400", "700"] });
await waitUntilDone();
// שימוש: fontFamily: "Rubik"

// Local Fonts
import { loadFont } from "@remotion/fonts";
await loadFont({ family: "MyFont", url: staticFile("fonts/MyFont.woff2"), weight: "400" });
```

---

## 3D עם React Three Fiber

```tsx
import { ThreeCanvas } from "@remotion/three";
// ⚠️ חובה: width + height על ThreeCanvas
// ⚠️ אסור: useFrame() מ-R3F — רק useCurrentFrame()
// ⚠️ Shaders/models לא מונפשים בעצמם

<ThreeCanvas width={1920} height={1080}>
  <ambientLight />
  <pointLight position={[10, 10, 10]} />
  <mesh rotation-y={frame * 0.05}>
    <boxGeometry />
    <meshStandardMaterial color="orange" />
  </mesh>
</ThreeCanvas>
```

---

## Audio Visualization

```tsx
import { useWindowedAudioData, visualizeAudio } from "@remotion/media-utils";

const audioData = useWindowedAudioData({ src, frame, fps, windowDuration: 0.3 });
if (!audioData) return null;

const freqs = visualizeAudio({ audioData, numberOfSamples: 64, frame, fps });
// freqs[0] = bass, freqs[63] = treble, range 0-1

// Bass reactive
const bass = freqs.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
const scale = 1 + bass * 0.5;
```

---

## גרפים (Charts)

```tsx
// ⚠️ חובה: כבה כל אנימציה מובנית של הספרייה
// כל animation חייב לעבור דרך useCurrentFrame()

// Bar chart staggered
bars.map((bar, i) => {
  const barFrame = Math.max(0, frame - i * 5);
  const height = spring({ frame: barFrame, fps, config: { damping: 200 } }) * bar.value;
  return <div style={{ height }} />;
});

// Line chart — path animation
import { evolvePath } from "@remotion/paths";
const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });
const { strokeDasharray, strokeDashoffset } = evolvePath(progress, path);
<path strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
```

---

## Rendering

```bash
# Preview
npx remotion studio

# Render
npx remotion render MyVideo out/video.mp4

# Transparent (ProRes)
npx remotion render --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444

# Transparent (WebM)
npx remotion render --image-format=png --pixel-format=yuva420p --codec=vp9

# עם Mapbox
npx remotion render --gl=angle --concurrency=1

# FFmpeg (built-in)
bunx remotion ffmpeg -ss 00:00:05 -i input.mp4 -to 00:00:10 -c:v libx264 -c:a aac output.mp4
```

---

## SFX מובנה

```tsx
import { Audio } from "@remotion/sfx";
// whoosh | whip | page-turn | switch | mouse-click | ding | bruh | vine-boom | windows-xp-error
<Audio type="whoosh" startFrom={0} />
```

---

## Lottie

```tsx
import { Lottie } from "@remotion/lottie";
// Fetch with delayRender → store in state → render
const [animData, setAnimData] = useState(null);
const { delayRender, continueRender } = useDelayRender();
useEffect(() => {
  fetch(staticFile("anim.json"))
    .then(r => r.json())
    .then(d => { setAnimData(d); continueRender(handle); });
}, []);
if (!animData) return null;
<Lottie animationData={animData} />
```

---

## Light Leaks

```tsx
import { LightLeak } from "@remotion/light-leaks"; // Remotion >= 4.0.415
// בתוך TransitionSeries.Overlay
<LightLeak durationInFrames={fps} seed={42} hueShift={0.3} />
```

---

## כללי ברזל — סיכום

| אסור | מותר |
|------|------|
| CSS `transition-*` | `interpolate()` |
| Tailwind `animate-*` | `spring()` |
| `useFrame()` (R3F) | `useCurrentFrame()` |
| `<img>` / `<video>` / `<audio>` | `<Img>` / `<Video>` / `<Audio>` |
| Library animations | כיבוי + frame-driven |
| `interface` לprops | `type` |
| URL ישיר לfאיל מקומי | `staticFile()` |
