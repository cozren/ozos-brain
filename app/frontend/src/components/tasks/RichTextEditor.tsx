import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { useEditor, EditorContent, useEditorState, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from 'tiptap-markdown'

const CYAN = 'var(--neon-cyan)'

// Plain Enter inserts a single-line break (tight spacing) instead of a new
// paragraph, so a description reads as one compact paragraph that grows line by
// line. Inside a list or code block, Enter keeps its default meaning so you can
// still add list items. Shift-Enter also still makes a hard break via StarterKit.
const EnterAsLineBreak = Extension.create({
  name: 'enterAsLineBreak',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('codeBlock')) return false
        return this.editor.commands.setHardBreak()
      },
    }
  },
})

// tiptap-markdown adds a `markdown` storage bucket at runtime but doesn't augment
// TipTap's Storage type, so read it through a narrow typed accessor.
function getMarkdown(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown()
}

interface Props {
  value: string // markdown in
  onChange: (md: string) => void // markdown out, on every edit
  placeholder?: string
  autofocus?: boolean
}

// WYSIWYG task-description editor. Reads & writes MARKDOWN so stored data and the
// react-markdown preview path stay unchanged — TipTap is only the editing surface.
export function RichTextEditor({ value, onChange, placeholder, autofocus }: Props) {
  const editor = useEditor({
    extensions: [
      // StarterKit (v3) bundles bold, italic, headings, bullet/ordered lists and link.
      StarterKit.configure({ link: { openOnClick: false } }),
      EnterAsLineBreak,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value,
    autofocus: autofocus ? 'end' : false,
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
  })

  // Sync when the value changes from OUTSIDE the editor (e.g. parent swaps tasks).
  // Guard against the echo of our own onChange so the cursor isn't reset mid-edit.
  useEffect(() => {
    if (!editor) return
    if (value !== getMarkdown(editor)) {
      editor.commands.setContent(value)
    }
  }, [value, editor])

  return (
    <div
      style={{
        border: `1px solid ${CYAN}`,
        borderRadius: 8,
        background: '#0a1422',
        overflow: 'hidden',
      }}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="rte-content" />
    </div>
  )
}

const BTN: CSSProperties = {
  minWidth: 28,
  height: 26,
  padding: '0 7px',
  borderRadius: 6,
  cursor: 'pointer',
  background: 'transparent',
  border: '1px solid #243a52',
  color: '#9fb6cc',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function Toolbar({ editor }: { editor: Editor | null }) {
  // useEditorState keeps active-state highlighting reactive without re-rendering on every keystroke.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: !!editor?.isActive('bold'),
      italic: !!editor?.isActive('italic'),
      heading: !!editor?.isActive('heading', { level: 2 }),
      bullet: !!editor?.isActive('bulletList'),
      ordered: !!editor?.isActive('orderedList'),
      link: !!editor?.isActive('link'),
    }),
  })
  if (!editor) return null
  const s = state ?? {
    bold: false,
    italic: false,
    heading: false,
    bullet: false,
    ordered: false,
    link: false,
  }

  const Btn = ({
    name,
    active,
    onClick,
    children,
  }: {
    name: string
    active: boolean
    onClick: () => void
    children: ReactNode
  }) => (
    <button
      type="button"
      aria-label={name}
      title={name}
      aria-pressed={active}
      // onMouseDown + preventDefault keeps the editor selection while clicking the toolbar.
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      style={{
        ...BTN,
        ...(active
          ? { color: '#04131f', background: CYAN, borderColor: CYAN, fontWeight: 700 }
          : {}),
      }}
    >
      {children}
    </button>
  )

  const setLink = () => {
    if (s.link) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = window.prompt('Link URL')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        padding: '6px 8px',
        borderBottom: '1px solid #1d3346',
        flexWrap: 'wrap',
      }}
    >
      <Btn name="Bold" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>B</b>
      </Btn>
      <Btn
        name="Italic"
        active={s.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <i>I</i>
      </Btn>
      <Btn
        name="Heading"
        active={s.heading}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H
      </Btn>
      <Btn
        name="Bullet list"
        active={s.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        •
      </Btn>
      <Btn
        name="Numbered list"
        active={s.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </Btn>
      <Btn name="Link" active={s.link} onClick={setLink}>
        🔗
      </Btn>
    </div>
  )
}
