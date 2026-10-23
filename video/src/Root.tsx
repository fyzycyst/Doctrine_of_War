import "./fonts";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { Edit, type EditProps } from "./Edit";
import media from "./generated/media.json";
import { buildTimeline, FPS, type Media } from "./timeline";

// The cut's length follows the timeline: the script's targets, stretched by the VO takes.
const metadata: CalculateMetadataFunction<EditProps> = ({ props }) => ({
  durationInFrames: buildTimeline(media as Media, { intro: props.intro }).frames,
});

/** `intro: false` (or INTRO=0 when rendering) drops the placeholder for the user's intro. */
const defaultProps: EditProps = { intro: true };

export function RemotionRoot() {
  return (
    <>
      <Composition id="Main" component={Edit} width={1920} height={1080} fps={FPS} durationInFrames={1} defaultProps={defaultProps} calculateMetadata={metadata} />
      <Composition id="Vertical" component={Edit} width={1080} height={1920} fps={FPS} durationInFrames={1} defaultProps={defaultProps} calculateMetadata={metadata} />
    </>
  );
}
