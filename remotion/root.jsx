import React from "react";
import { Composition } from "remotion";
import { PayFlowExplainer } from "./payflow-explainer.jsx";
import { PayFlowFullVideo } from "./payflow-full-video.jsx";

export const RemotionRoot = () => (
  <>
    <Composition
      id="payflow-explainer"
      component={PayFlowExplainer}
      durationInFrames={2250}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="payflow-full-video"
      component={PayFlowFullVideo}
      durationInFrames={3480}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
