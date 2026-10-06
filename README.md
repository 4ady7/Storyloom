# Storyloom

Weave your photographs into a story.

Storyloom reads a collection of photographs together, builds a story and a visual language, then grades only the frames that need to move. Original files are kept and every treatment is a new version.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run typecheck
```

## Photographs and keys

Projects are stored on disk in `data/projects`. That folder is not public and is gitignored.

API keys stay on the server. Copy `.env.example` to `.env.local` if you want OpenAI vision:

```bash
OPENAI_API_KEY=your-key
```

Without a key, Storyloom still reads the story from your words and from the light, colour, and framing in the files, then grades with a local photographic treatment. It does not invent faces. Set `STORYLOOM_GENERATIVE_EDITS=true` only if you also unlock Identity and accept that a remote editor may alter pixels. The default path never sends photographs to an image generator.
