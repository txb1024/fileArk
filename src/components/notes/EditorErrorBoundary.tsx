import { Component, type ReactNode } from "react";

interface Props {
  /** 当这个 key 变化时,自动清除当前错误状态(用户切便签视为重试) */
  resetKey: string;
  /** 错误时的回退 UI 文案 */
  fallbackText: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 包住 vditor 编辑器:vditor 内部偶发抛错(IndexSizeError、destroy race 等)
 * 不应让整个 React 树死循环重挂载。错误时显示静态回退,用户切便签会自动恢复。
 */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[EditorErrorBoundary] caught:", error, info);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="notes-editor-error">
          <div className="notes-editor-error-title">{this.props.fallbackText}</div>
          <div className="notes-editor-error-detail">
            {this.state.error.message || String(this.state.error)}
          </div>
          <button
            className="compact-button"
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
