"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="missing" id="main">
      <div>
        <h1>Something went wrong.</h1>
        <p>Your photographs are still stored with the story on this machine.</p>
        <button className="btn" type="button" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
