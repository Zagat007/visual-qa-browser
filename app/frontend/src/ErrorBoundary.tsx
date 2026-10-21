import React from 'react';
import type { ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <main className="shell"><section className="panel"><h1>Visual QA Browser</h1><p>UI failed to render. Restart the local application and inspect the terminal log.</p></section></main>;
    }
    return this.props.children;
  }
}
