"use client";
import React from "react";
import ErrorMessage from "./ErrorMessage";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Optionally log error to an error reporting service
    // console.error(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorMessage message={"حدث خطأ غير متوقع. حاول مرة أخرى."} />;
    }
    return this.props.children;
  }
}
