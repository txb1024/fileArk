import { useSyncExternalStore } from "react";
import type { BlockNoteEditor } from "@blocknote/core";

/**
 * 跨组件暴露当前活动 NoteEditor 的 BlockNote editor 实例。
 *
 * 用途:NotesView 顶栏需要在编辑器外触发「导出」、未来还可能加「插入」「替换」等操作,
 * 又不想把整套 ref/props 链路重构成 forwardRef。模块级 store 比 React Context 简单,
 * 在父子组件之间相互隔离,且能跨多个组件无 prop drilling 订阅。
 *
 * NoteEditor 在 mount/unmount 时调 set;NotesView 用 useActiveNoteEditor() 读。
 */

type Editor = BlockNoteEditor<any, any, any> | null;

let current: Editor = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export const activeNoteEditorStore = {
  set(editor: Editor) {
    if (current === editor) return;
    current = editor;
    emit();
  },
  get(): Editor {
    return current;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useActiveNoteEditor(): Editor {
  return useSyncExternalStore(
    activeNoteEditorStore.subscribe,
    activeNoteEditorStore.get,
    () => null,
  );
}
