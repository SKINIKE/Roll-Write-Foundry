import { useState } from 'react';
import './App.css';

function App(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <main className="app">
      <h1>Roll &amp; Write Foundry</h1>
      <p>The desktop shell for creating, playing, and exporting roll &amp; write games.</p>
      <button type="button" onClick={() => setCount((previous) => previous + 1)}>
        Clicked {count} times
      </button>
    </main>
  );
}

export default App;
