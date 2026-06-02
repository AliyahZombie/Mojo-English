export default function App() {
  const sections = ['Dictionary', 'Review', 'Writing', 'News'];
  return (
    <main className="app-shell">
      <h1>Mojo English</h1>
      <p>Practice vocabulary, reading, and writing from one focused MVP.</p>
      <nav>{sections.map((section) => <span key={section}>{section}</span>)}</nav>
    </main>
  );
}
