import { Composition, registerRoot } from "remotion";
import { Film } from "./Film";

registerRoot(() => (
  <Composition
    id="TheEnrollmentRecord"
    component={Film}
    width={1920}
    height={1080}
    fps={24}
    durationInFrames={1008}
  />
));
