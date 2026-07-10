import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const fps = 30;

const colors = {
  canvas: "#F7F6F2",
  paper: "#FFFFFF",
  ink: "#171717",
  muted: "#6F6B63",
  line: "#DDD9D0",
  green: "#3E8F68",
  greenSoft: "#DFF3E8",
  blue: "#315EA8",
  blueSoft: "#E8EEF9",
  amber: "#A7651B",
  amberSoft: "#FFF1E6",
  red: "#A33A36",
  redSoft: "#FBE8E6",
};

const seconds = (value) => Math.round(value * fps);

const introScenes = [
  {
    from: 0,
    duration: 7,
    eyebrow: "Problem",
    title: "A paid cart can still become a stuck order",
    copy: "Checkout looks successful, but completion or activation can fail downstream.",
    visual: "problem",
  },
  {
    from: 7,
    duration: 11,
    eyebrow: "Why It Hurts",
    title: "Operations teams lose time stitching evidence together",
    copy: "Payment, order ledger, traces, eligibility, pending orders, and activation details live in different places.",
    visual: "systems",
  },
  {
    from: 18,
    duration: 12,
    eyebrow: "Proposed Solution",
    title: "PayFlow acts like a transparent recovery assistant",
    copy: "It plans, calls tools, diagnoses, checks safety, asks for approval, executes, verifies, and escalates with evidence.",
    visual: "agent",
  },
  {
    from: 30,
    duration: 12,
    eyebrow: "Architecture",
    title: "One agent core, carrier-specific adapters",
    copy: "Carrier A Order API and Carrier B OMS map into one canonical model, keeping diagnosis and policy reusable.",
    visual: "architecture",
  },
];

const operationScenes = [
  {
    from: 42,
    duration: 12,
    videoStart: 0,
    title: "Operations workspace",
    callout: "Sidebar, carrier switcher, demo path, memory, queue metrics, and the failure database.",
  },
  {
    from: 54,
    duration: 14,
    videoStart: 22,
    title: "Failure intelligence",
    callout: "Selected failure, amount at risk, failure domain, root cause, recommended action, and evidence signals.",
  },
  {
    from: 68,
    duration: 14,
    videoStart: 39,
    title: "Business impact",
    callout: "Impact calculator, adjustable assumptions, batch mode, and deterministic recovery metrics.",
  },
  {
    from: 82,
    duration: 14,
    videoStart: 57,
    title: "Carrier portability",
    callout: "Two carrier schemas are normalized into the same recovery agent workflow.",
  },
  {
    from: 96,
    duration: 12,
    videoStart: 72,
    title: "Agent inspector",
    callout: "Run investigation, AI recommended action, approval controls, status, summary, and reasoning tabs.",
  },
  {
    from: 108,
    duration: 8,
    videoStart: 102,
    title: "Safety and escalation",
    callout: "Blocked carts and failed verification stop with an evidence packet instead of unsafe automation.",
  },
];

export const PayFlowFullVideo = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={styles.page}>
      <Grid />
      <TopBar />
      {introScenes.map((scene) => (
        <Sequence key={scene.from} from={seconds(scene.from)} durationInFrames={seconds(scene.duration)}>
          <IntroScene scene={scene} />
        </Sequence>
      ))}
      {operationScenes.map((scene) => (
        <Sequence key={scene.from} from={seconds(scene.from)} durationInFrames={seconds(scene.duration)}>
          <OperationScene scene={scene} />
        </Sequence>
      ))}
      <Progress frame={frame} />
    </AbsoluteFill>
  );
};

const IntroScene = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps: videoFps } = useVideoConfig();
  const enter = spring({ frame, fps: videoFps, config: { damping: 18, stiffness: 90 } });
  const opacity = interpolate(frame, [0, 12, seconds(scene.duration) - 12, seconds(scene.duration)], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...styles.scene, opacity }}>
      <div style={{ ...styles.copy, transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px)` }}>
        <div style={styles.eyebrow}>{scene.eyebrow}</div>
        <h1 style={styles.title}>{scene.title}</h1>
        <p style={styles.body}>{scene.copy}</p>
      </div>
      <div style={{ ...styles.visual, transform: `scale(${interpolate(enter, [0, 1], [0.96, 1])})` }}>
        <Visual type={scene.visual} />
      </div>
    </AbsoluteFill>
  );
};

const OperationScene = ({ scene }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, seconds(scene.duration) - 10, seconds(scene.duration)], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...styles.operationScene, opacity }}>
      <div style={styles.videoFrame}>
        <OffthreadVideo
          muted
          src={staticFile("payflow-app-walkthrough.mp4")}
          startFrom={seconds(scene.videoStart)}
          style={styles.appVideo}
        />
      </div>
      <div style={styles.operationCallout}>
        <div style={styles.calloutLabel}>Application walkthrough</div>
        <h2>{scene.title}</h2>
        <p>{scene.callout}</p>
      </div>
    </AbsoluteFill>
  );
};

const Visual = ({ type }) => {
  if (type === "systems") return <SystemsVisual />;
  if (type === "agent") return <AgentVisual />;
  if (type === "architecture") return <ArchitectureVisual />;
  return <ProblemVisual />;
};

const ProblemVisual = () => (
  <div style={styles.problemPanel}>
    <Metric label="Payment" value="Authorized" tone="green" />
    <Metric label="Order" value="Incomplete" tone="red" />
    <Metric label="Amount at risk" value="$142" tone="amber" />
    <div style={styles.problemArrow}>→</div>
    <div style={styles.problemText}>Cart needs recovery before the customer journey can continue.</div>
  </div>
);

const SystemsVisual = () => (
  <div style={styles.systemGrid}>
    {["Payment status", "Order ledger", "Trace events", "Eligibility", "Pending orders", "Activation"].map((item, index) => (
      <div key={item} style={{ ...styles.systemCard, transform: `translateY(${index % 2 ? 24 : 0}px)` }}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <strong>{item}</strong>
      </div>
    ))}
  </div>
);

const AgentVisual = () => (
  <div style={styles.agentPanel}>
    {["Plan", "Tools", "Diagnosis", "Safety", "Approval", "Executor", "Verify"].map((step) => (
      <div key={step} style={styles.agentStep}>
        <i />
        <strong>{step}</strong>
      </div>
    ))}
    <pre style={styles.toolText}>{`db_query()
es_trace()
eligibility_check()
order_api_get_activation_details()`}</pre>
  </div>
);

const ArchitectureVisual = () => (
  <div style={styles.archPanel}>
    <div style={styles.carrier}>Carrier A<br /><span>Order API</span></div>
    <div style={styles.pipe}>→</div>
    <div style={styles.core}>Canonical<br /><span>Order Model</span></div>
    <div style={styles.pipe}>→</div>
    <div style={styles.carrier}>Carrier B<br /><span>OMS</span></div>
    <div style={styles.archFooter}>Shared diagnosis • Shared policy • Shared verification</div>
  </div>
);

const Metric = ({ label, value, tone }) => (
  <div style={styles.metric}>
    <span>{label}</span>
    <strong style={{ color: toneColor(tone) }}>{value}</strong>
  </div>
);

const TopBar = () => (
  <div style={styles.topbar}>
    <Logo />
    <strong>PayFlow Recovery Agent</strong>
  </div>
);

const Logo = () => (
  <div style={styles.logo}>
    <span>P</span>
    <i />
  </div>
);

const Grid = () => <AbsoluteFill style={styles.grid} />;

const Progress = ({ frame }) => {
  const width = interpolate(frame, [0, 3480], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.linear,
  });
  return <div style={{ ...styles.progress, width: `${width}%` }} />;
};

const toneColor = (tone) => ({
  green: colors.green,
  blue: colors.blue,
  amber: colors.amber,
  red: colors.red,
}[tone] || colors.ink);

const styles = {
  page: {
    background: colors.canvas,
    color: colors.ink,
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  grid: {
    backgroundImage: "linear-gradient(rgba(30,30,30,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(30,30,30,0.035) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
  },
  topbar: {
    position: "absolute",
    top: 54,
    left: 74,
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: 16,
    fontSize: 25,
  },
  logo: {
    position: "relative",
    width: 48,
    height: 48,
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    background: "#FBFAF7",
    border: `1px solid ${colors.line}`,
    boxShadow: "0 18px 42px rgba(24,24,27,0.12)",
    fontWeight: 900,
    fontSize: 24,
  },
  scene: {
    display: "grid",
    gridTemplateColumns: "0.96fr 1.04fr",
    gap: 70,
    padding: "165px 88px 86px",
    alignItems: "center",
  },
  copy: {
    maxWidth: 760,
  },
  eyebrow: {
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 2.1,
    fontWeight: 850,
    fontSize: 24,
    marginBottom: 22,
  },
  title: {
    fontSize: 72,
    lineHeight: 1.04,
    letterSpacing: 0,
    margin: 0,
  },
  body: {
    marginTop: 28,
    color: colors.muted,
    fontSize: 31,
    lineHeight: 1.36,
  },
  visual: {
    minHeight: 620,
  },
  problemPanel: {
    position: "relative",
    background: colors.paper,
    border: `1px solid ${colors.line}`,
    borderRadius: 30,
    padding: 46,
    boxShadow: "0 30px 80px rgba(24,24,27,0.10)",
  },
  metric: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 24,
    background: "#FBFAF7",
    border: `1px solid ${colors.line}`,
    borderRadius: 17,
    padding: "22px 24px",
    marginBottom: 16,
  },
  problemArrow: {
    fontSize: 68,
    color: colors.green,
    marginTop: 14,
  },
  problemText: {
    color: colors.muted,
    fontSize: 27,
    lineHeight: 1.35,
  },
  systemGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  },
  systemCard: {
    minHeight: 150,
    background: colors.paper,
    border: `1px solid ${colors.line}`,
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 18px 48px rgba(24,24,27,0.08)",
  },
  agentPanel: {
    background: colors.paper,
    border: `1px solid ${colors.line}`,
    borderRadius: 30,
    padding: 38,
    boxShadow: "0 30px 80px rgba(24,24,27,0.10)",
  },
  agentStep: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    borderBottom: `1px solid ${colors.line}`,
    padding: "16px 0",
    fontSize: 28,
  },
  toolText: {
    marginTop: 26,
    color: colors.blue,
    fontSize: 23,
    lineHeight: 1.45,
  },
  archPanel: {
    background: colors.paper,
    border: `1px solid ${colors.line}`,
    borderRadius: 30,
    padding: 42,
    display: "grid",
    gridTemplateColumns: "1fr 80px 1.15fr 80px 1fr",
    gap: 18,
    alignItems: "center",
    boxShadow: "0 30px 80px rgba(24,24,27,0.10)",
  },
  carrier: {
    background: "#FBFAF7",
    border: `1px solid ${colors.line}`,
    borderRadius: 22,
    padding: 28,
    textAlign: "center",
    fontSize: 30,
    fontWeight: 850,
  },
  core: {
    background: colors.greenSoft,
    border: `1px solid rgba(62,143,104,0.25)`,
    borderRadius: 22,
    padding: 28,
    textAlign: "center",
    color: colors.green,
    fontSize: 30,
    fontWeight: 850,
  },
  pipe: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 42,
  },
  archFooter: {
    gridColumn: "1 / 6",
    textAlign: "center",
    color: colors.muted,
    fontSize: 27,
    marginTop: 24,
  },
  operationScene: {
    display: "grid",
    gridTemplateColumns: "1fr 430px",
    gap: 28,
    padding: "134px 58px 58px",
  },
  videoFrame: {
    overflow: "hidden",
    background: colors.paper,
    border: `1px solid ${colors.line}`,
    borderRadius: 24,
    boxShadow: "0 28px 70px rgba(24,24,27,0.14)",
  },
  appVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  operationCallout: {
    alignSelf: "start",
    marginTop: 68,
    background: "rgba(255,255,255,0.94)",
    border: `1px solid ${colors.line}`,
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 20px 54px rgba(24,24,27,0.11)",
  },
  calloutLabel: {
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontSize: 17,
    fontWeight: 850,
    marginBottom: 18,
  },
  progress: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 8,
    background: colors.green,
  },
};
