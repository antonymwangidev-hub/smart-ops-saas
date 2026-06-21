import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Catches any uncaught render error anywhere in the component tree below it
 * and shows a friendly, actionable screen instead of a blank white page.
 *
 * Without this, any unhandled exception (a null product, a malformed date,
 * a network hiccup mid-render) crashes the entire React tree silently —
 * the user sees nothing and has no way to recover except guessing to
 * reload. For a non-technical shop owner, that's the difference between
 * "the app is broken forever" and "oh, it just needs a refresh."
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || "Something went wrong" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // In production this is where you'd forward to an error tracking
    // service (Sentry, etc). For now, log so it's visible in dev tools.
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: "" });
    window.location.href = "/daily-summary";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-sm w-full text-center space-y-5">
            <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-bold text-foreground">
                Something went wrong
              </h1>
              <p className="text-sm text-muted-foreground">
                Kuna hitilafu. Don't worry — your sales data is safe.
                Just tap the button below to continue.
              </p>
            </div>

            <div className="space-y-2">
              <Button
                onClick={this.handleReload}
                size="lg"
                className="w-full h-14 text-base gap-2 rounded-xl"
              >
                <RefreshCw className="h-5 w-5" />
                Reload App
              </Button>
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                size="lg"
                className="w-full h-14 text-base gap-2 rounded-xl"
              >
                <Home className="h-5 w-5" />
                Go to Home
              </Button>
            </div>

            <p className="text-xs text-muted-foreground/70">
              If this keeps happening, contact support and mention:
              <br />
              <span className="font-mono">{this.state.errorMessage.slice(0, 80)}</span>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
