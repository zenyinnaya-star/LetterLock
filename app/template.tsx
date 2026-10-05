// Re-mounts on every navigation: runs a quick curtain wipe + content rise (pure CSS so it works before hydration).
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="page-curtain" aria-hidden />
      <div className="page-in">{children}</div>
    </>
  );
}
