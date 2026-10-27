# Skill: Capture Learning

## Purpose
Clean and structure raw learning content from any source — online courses, books, podcasts, talks, or rough personal notes — and save it as a structured Markdown file in the OZOS knowledge hub.

## Usage
Invoke this skill by referencing it in your prompt:
> "Use the skill at skills/capture-learning/SKILL.md"

Always provide:
- Source type (course / book / podcast / talk / my notes)
- Source name (e.g. "AI Evals", "Thinking Fast and Slow", "Lenny's Podcast")
- Unit type and number if applicable (e.g. module 02, chapter 5, episode 312)
- Unit title (e.g. "Defining Good")
- Output path (full path inside knowledge-hub/)
- The raw content to capture

---

## Source type behaviour

Adapt the file structure based on source type:

| Source type | Unit label | Filename pattern |
|---|---|---|
| Online course | module | `module-NN-slugified-title.md` |
| Book | chapter | `chapter-NN-slugified-title.md` |
| Podcast / talk | episode | `episode-NN-slugified-title.md` or `talk-slugified-title.md` |
| My own notes | note | `note-slugified-title.md` |

Where NN = zero-padded number (01, 02, 03...) and slugified-title = lowercase, hyphens, no special characters.

---

## Rules for cleaning input

- Remove all navigation chrome: site headers, footers, progress indicators, completion buttons, login prompts, cookie banners, percentage indicators, or any UI text not part of the actual content
- Replace image placeholders (lines that are just "￼" or similar artefacts) with a Markdown image reference using context-aware alt text:
  `![descriptive alt text](assets/unittype-NN-image-01.png)`
  Number images sequentially per unit: image-01, image-02, etc.
- For podcast/talk transcripts: remove filler words, false starts, and repetition — preserve meaning and speaker voice
- For rough personal notes: preserve meaning but clean up formatting inconsistencies
- Keep all actual content: headings, body text, bullet points, frameworks, quotes
- Preserve original structure and hierarchy

---

## File structure

```
---
source_type: [course | book | podcast | talk | notes]
source: [Source Name]
unit_type: [module | chapter | episode | talk | note]
unit: [NN or blank if not applicable]
title: [Unit Title]
date: [today's date]
status: notes
---

[cleaned content]

---
## My notes
<!-- fill in after reading/watching/listening -->

## Suggested synthesis connections
<!-- auto-suggested by Claude based on content -->
```

---

## Synthesis suggestion rules

After cleaning the content, analyse it and suggest which sections of `_synthesis.md` it feeds. Use this format at the bottom of the file:

```markdown
## Suggested synthesis connections

Based on this content, consider updating:
- **Core mental models** — [one sentence on why, e.g. "the AI Flywheel reframes how to think about product quality loops"]
- **Key frameworks** — [one sentence on why, e.g. "Agent Success Rate is a concrete framework worth capturing"]
- **Applied to my company** — [one sentence on a specific connection to your current product or team]
```

Only suggest sections that genuinely apply. If a section doesn't connect, omit it.

---

## Example invocation prompt

```
Use the skill at skills/capture-learning/SKILL.md.

Source type: course
Source name: AI Evals
Unit type: module
Unit number: 02
Unit title: Defining Good
Output path: knowledge-hub/ai-learning/AI Evals/

Here is the raw copied text:

[PASTE RAW CONTENT HERE]
```
