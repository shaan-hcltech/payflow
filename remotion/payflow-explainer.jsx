import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const palette = {
  canvas: "#F7F6F2",
  panel: "#FFFFFF",
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

const scenes = [
  {
    start: 0,
    duration: 180,
    eyebrow: "PayFlow Recovery Agent",
    title: "Recover stuck payment carts without guessing",
    copy: "A transparent agent for telecom payment and order-completion failures.",
    type: "hero",
  },
  {
    start: 180,
    duration: 300,
    eyebrow: "The Problem",
    title: "Money is authorized, but orders still get stuck",
    copy: "Ops teams manually chase payment status, order state, traces, eligibility, and activation signals across disconnected systems.",
    type: "problem",
  },
  {
    start: 480,
    duration: 360,
    eyebrow: "The Agent",
    title: "Plan, investigate, diagnose, ask, act, verify",
    copy: "Every run leaves an evidence trail: tool transcript, safety check, approval gate, execution result, and post-action verification.",
    type: "agent",
  },
  {
    start: 840,
    duration: 300,
    eyebrow: "The Workspace",
    title: "Operators see the queue, root cause, risk, and business impact",
    copy: "Failure intelligence, impact calculator, batch simulation, and carrier portability are visible in one clean workspace.",
    type: "workspace",
  },
  {
    start: 1140,
    duration: 330,
    eyebrow: "Safety",
    title: "The agent does not automate risky carts",
    copy: "Declines, credit holds, and unresolved verification failures stop at escalation with a WFM/Jira-style evidence packet.",
    type: "safety",
  },
  {
    start: 1470,
    duration: 270,
    eyebrow: "Portability",
    title: "One agent core, multiple carrier schemas",
    copy: "Carrier A Order API and Carrier B OMS map into the same canonical model, so diagnosis logic stays reusable.",
    type: "portability",
  },
  {
    start: 1740,
    duration: 360,
    eyebrow: "Demo Outcome",
    title: "From stuck carts to recovered revenue",
    copy: "The demo proves recovery, safety-block escalation, retry discipline, batch impact, and carrier portability.",
    type: "outcome",
  },
  {
    start: 2100,
    duration: 150,
    eyebrow: "PayFlow",
    title: "Agentic recovery for payment operations",
    copy: "Demo-ready, offline, deterministic, and built for clear executive storytelling.",
    type: "close",
  },
];

export const PayFlowExplainer = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={styles.page}>
      <BackgroundGrid />
      <TopBar />
      {scenes.map((scene) => (
        <Sequence key={scene.start} from={scene.start} durationInFrames={scene.duration}>
          <Scene scene={scene} />
        </Sequence>
      ))}
      <Progress frame={frame} />
    </AbsoluteFill>
  );
};

const Scene = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 95 } });
  const fade = interpolate(frame, [0, 18, scene.duration - 24, scene.duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...styles.scene, opacity: fade }}>
      <div
        style={{
          ...styles.copyBlock,
          transform: `translateY(${interpolate(enter, [0, 1], [28, 0])}px)`,
        }}
      >
        <div style={styles.eyebrow}>{scene.eyebrow}</div>
        <h1 style={styles.title}>{scene.title}</h1>
        <p style={styles.copy}>{scene.copy}</p>
      </div>
      <div
        style={{
          ...styles.visualBlock,
          transform: `scale(${interpolate(enter, [0, 1], [0.96, 1])}) translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
        }}
      >
        <Visual type={scene.type} />
      </div>
    </AbsoluteFill>
  );
};

const Visual = ({ type }) => {
  if (type === "problem") return <ProblemVisual />;
  if (type === "agent") return <AgentVisual />;
  if (type === "workspace") return <WorkspaceVisual />;
  if (type === "safety") return <SafetyVisual />;
  if (type === "portability") return <PortabilityVisual />;
  if (type === "outcome") return <OutcomeVisual />;
  if (type === "close") return <CloseVisual />;
  return <HeroVisual />;
};

const HeroVisual = () => (
  <div style={styles.heroCard}>
    <Logo large />
    <div style={{ marginTop: 34 }}>
      <Metric label="Stuck carts" value="12" tone="blue" />
      <Metric label="Amount at risk" value="$1,825" tone="amber" />
      <Metric label="Manual minutes" value="144" tone="green" />
    </div>
  </div>
);

const ProblemVisual = () => (
  <div style={styles.stack}>
    {[
      ["Payment authorized", "Not posted to order ledger", palette.amberSoft, palette.amber],
      ["Submit missing", "Cart reached CP2 without completion", palette.redSoft, palette.red],
      ["Manual triage", "Ops checks five systems by hand", palette.blueSoft, palette.blue],
    ].map(([title, text, bg, color], index) => (
      <div key={title} style={{ ...styles.problemCard, marginLeft: index * 34, background: bg }}>
        <div style={{ ...styles.dot, background: color }} />
        <strong>{title}</strong>
        <span>{text}</span>
      </div>
    ))}
  </div>
);

const AgentVisual = () => {
  const nodes = ["Plan", "Tools", "Diagnosis", "Safety", "Approval", "Executor", "Verify"];
  return (
    <div style={styles.agentPanel}>
      {nodes.map((node, index) => (
        <div key={node} style={styles.agentNode}>
          <span style={{ ...styles.nodePulse, animationDelay: `${index * 120}ms` }} />
          <strong>{node}</strong>
        </div>
      ))}
      <div style={styles.transcript}>
        <span>db_query()</span>
        <span>es_trace()</span>
        <span>eligibility_check()</span>
        <span>order_api_get_activation_details()</span>
      </div>
    </div>
  );
};

const WorkspaceVisual = () => (
  <div style={styles.workspaceMock}>
    <div style={styles.tableMock}>
      <Header label="Failure queue" />
      {[
        ["CA-CART-1001", "Order is not fully paid", "$142"],
        ["CA-CART-1002", "Submit Payment Missing", "$87"],
        ["CA-CART-1005", "Credit hold", "$306"],
      ].map((row) => (
        <div key={row[0]} style={styles.tableRow}>
          <strong>{row[0]}</strong>
          <span>{row[1]}</span>
          <em>{row[2]}</em>
        </div>
      ))}
    </div>
    <div style={styles.smallPanel}>
      <Header label="Failure intelligence" />
      <Badge text="Root cause" tone="blue" />
      <Badge text="Evidence signals" tone="green" />
      <Badge text="Recommended action" tone="amber" />
    </div>
    <div style={styles.smallPanel}>
      <Header label="Impact calculator" />
      <Metric label="Daily recovered" value="864" tone="green" />
      <Metric label="Revenue protected" value="$155,520" tone="amber" />
    </div>
  </div>
);

const SafetyVisual = () => (
  <div style={styles.safetyPanel}>
    <div style={styles.statusGood}>Recovered after approval</div>
    <div style={styles.statusStop}>Credit hold blocked executor</div>
    <div style={styles.statusStop}>Retry failed, escalation packet created</div>
    <pre style={styles.packet}>{`WFM / Jira packet
cart: CA-CART-1010
root cause: gateway timeout
evidence: trace + state reread
action: escalate`}</pre>
  </div>
);

const PortabilityVisual = () => (
  <div style={styles.portabilityPanel}>
    <div style={styles.schema}>Carrier A<br /><span>Order API</span></div>
    <Arrow />
    <div style={styles.schemaCore}>Canonical<br /><span>Order Model</span></div>
    <Arrow />
    <div style={styles.schema}>Carrier B<br /><span>OMS</span></div>
    <div style={styles.coreLine}>Same diagnosis core. Same policy. Same verification loop.</div>
  </div>
);

const OutcomeVisual = () => (
  <div style={styles.outcomeGrid}>
    <Metric label="Recovered carts" value="7" tone="green" />
    <Metric label="Escalated safely" value="5" tone="red" />
    <Metric label="Recovery rate" value="58%" tone="blue" />
    <Metric label="Minutes saved" value="84" tone="amber" />
  </div>
);

const CloseVisual = () => (
  <div style={styles.closeCard}>
    <Logo large />
    <div style={styles.closeText}>PayFlow</div>
  </div>
);

const TopBar = () => (
  <div style={styles.topbar}>
    <Logo />
    <span>PayFlow Recovery Agent</span>
  </div>
);

const Logo = ({ large = false }) => (
  <div style={{ ...styles.logo, width: large ? 120 : 46, height: large ? 120 : 46, borderRadius: large ? 28 : 12 }}>
    <span style={{ fontSize: large ? 58 : 23 }}>P</span>
    <i style={{ ...styles.logoNode, width: large ? 22 : 10, height: large ? 22 : 10, right: large ? 22 : 9, top: large ? 43 : 17 }} />
  </div>
);

const Metric = ({ label, value, tone }) => (
  <div style={styles.metric}>
    <span>{label}</span>
    <strong style={{ color: toneColor(tone) }}>{value}</strong>
  </div>
);

const Header = ({ label }) => <div style={styles.mockHeader}>{label}</div>;

const Badge = ({ text, tone }) => (
  <span style={{ ...styles.badge, background: toneSoft(tone), color: toneColor(tone) }}>{text}</span>
);

const Arrow = () => <div style={styles.arrow}>→</div>;

const BackgroundGrid = () => <AbsoluteFill style={styles.grid} />;

const Progress = ({ frame }) => {
  const width = interpolate(frame, [0, 2250], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.linear,
  });
  return <div style={{ ...styles.progress, width: `${width}%` }} />;
};

const toneColor = (tone) => ({
  green: palette.green,
  blue: palette.blue,
  amber: palette.amber,
  red: palette.red,
}[tone] || palette.ink);

const toneSoft = (tone) => ({
  green: palette.greenSoft,
  blue: palette.blueSoft,
  amber: palette.amberSoft,
  red: palette.redSoft,
}[tone] || "#F0EFEB");

const styles = {
  page: {
    background: palette.canvas,
    color: palette.ink,
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  grid: {
    backgroundImage: "linear-gradient(rgba(30,30,30,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(30,30,30,0.035) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
  },
  topbar: {
    position: "absolute",
    left: 72,
    top: 58,
    display: "flex",
    alignItems: "center",
    gap: 16,
    fontSize: 25,
    fontWeight: 800,
    zIndex: 2,
  },
  scene: {
    display: "grid",
    gridTemplateColumns: "0.95fr 1.05fr",
    gap: 70,
    padding: "165px 88px 90px",
    alignItems: "center",
  },
  copyBlock: {
    maxWidth: 730,
  },
  eyebrow: {
    color: palette.muted,
    textTransform: "uppercase",
    letterSpacing: 2.2,
    fontWeight: 800,
    fontSize: 25,
    marginBottom: 22,
  },
  title: {
    fontSize: 76,
    lineHeight: 1.02,
    margin: 0,
    letterSpacing: 0,
  },
  copy: {
    fontSize: 31,
    lineHeight: 1.36,
    color: palette.muted,
    marginTop: 30,
  },
  visualBlock: {
    minHeight: 640,
  },
  logo: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    background: "#FBFAF7",
    border: `1px solid ${palette.line}`,
    boxShadow: "0 24px 60px rgba(24,24,27,0.12)",
    fontWeight: 900,
  },
  logoNode: {
    position: "absolute",
    borderRadius: 99,
    background: palette.greenSoft,
    border: `4px solid ${palette.green}`,
  },
  heroCard: {
    background: palette.panel,
    border: `1px solid ${palette.line}`,
    borderRadius: 30,
    padding: 54,
    boxShadow: "0 30px 80px rgba(24,24,27,0.10)",
  },
  metric: {
    background: "#FBFAF7",
    border: `1px solid ${palette.line}`,
    borderRadius: 16,
    padding: "22px 24px",
    marginTop: 14,
  },
  stack: {
    paddingTop: 70,
  },
  problemCard: {
    width: 700,
    border: `1px solid ${palette.line}`,
    borderRadius: 22,
    padding: 30,
    marginBottom: 24,
    boxShadow: "0 18px 42px rgba(24,24,27,0.08)",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 99,
    marginBottom: 18,
  },
  agentPanel: {
    background: palette.panel,
    border: `1px solid ${palette.line}`,
    borderRadius: 26,
    padding: 38,
  },
  agentNode: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    borderBottom: `1px solid ${palette.line}`,
    padding: "18px 0",
    fontSize: 28,
  },
  nodePulse: {
    width: 18,
    height: 18,
    borderRadius: 99,
    background: palette.green,
  },
  transcript: {
    marginTop: 30,
    display: "grid",
    gap: 12,
    color: palette.blue,
    fontSize: 22,
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
  },
  workspaceMock: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr",
    gap: 18,
  },
  tableMock: {
    gridColumn: "1 / 3",
    background: palette.panel,
    border: `1px solid ${palette.line}`,
    borderRadius: 22,
    padding: 24,
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1.3fr 0.45fr",
    gap: 16,
    alignItems: "center",
    padding: "18px 0",
    borderTop: `1px solid ${palette.line}`,
    fontSize: 22,
  },
  smallPanel: {
    background: palette.panel,
    border: `1px solid ${palette.line}`,
    borderRadius: 22,
    padding: 24,
    minHeight: 210,
  },
  mockHeader: {
    fontWeight: 850,
    fontSize: 25,
    marginBottom: 20,
  },
  badge: {
    display: "inline-block",
    padding: "9px 13px",
    borderRadius: 999,
    marginRight: 10,
    marginBottom: 10,
    fontWeight: 750,
    fontSize: 18,
  },
  safetyPanel: {
    display: "grid",
    gap: 18,
  },
  statusGood: {
    ...statusBase(palette.greenSoft, palette.green),
  },
  statusStop: {
    ...statusBase(palette.redSoft, palette.red),
  },
  packet: {
    background: "#171717",
    color: "#F7F6F2",
    borderRadius: 22,
    padding: 28,
    fontSize: 23,
    lineHeight: 1.45,
  },
  portabilityPanel: {
    background: palette.panel,
    border: `1px solid ${palette.line}`,
    borderRadius: 30,
    padding: 44,
    display: "grid",
    gridTemplateColumns: "1fr 80px 1.15fr 80px 1fr",
    alignItems: "center",
    gap: 18,
  },
  schema: {
    background: "#FBFAF7",
    border: `1px solid ${palette.line}`,
    borderRadius: 24,
    padding: 28,
    textAlign: "center",
    fontSize: 30,
    fontWeight: 850,
  },
  schemaCore: {
    background: palette.greenSoft,
    border: `1px solid rgba(62,143,104,0.25)`,
    color: palette.green,
    borderRadius: 24,
    padding: 30,
    textAlign: "center",
    fontSize: 30,
    fontWeight: 850,
  },
  arrow: {
    textAlign: "center",
    fontSize: 44,
    color: palette.muted,
  },
  coreLine: {
    gridColumn: "1 / 6",
    marginTop: 28,
    color: palette.muted,
    fontSize: 28,
    textAlign: "center",
  },
  outcomeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 22,
  },
  closeCard: {
    minHeight: 560,
    background: palette.panel,
    border: `1px solid ${palette.line}`,
    borderRadius: 34,
    display: "grid",
    placeItems: "center",
    boxShadow: "0 30px 80px rgba(24,24,27,0.10)",
  },
  closeText: {
    marginTop: -150,
    fontSize: 56,
    fontWeight: 900,
  },
  progress: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 8,
    background: palette.green,
  },
};

function statusBase(background, color) {
  return {
    background,
    color,
    borderRadius: 18,
    padding: "24px 28px",
    border: `1px solid ${color}33`,
    fontSize: 28,
    fontWeight: 850,
  };
}
