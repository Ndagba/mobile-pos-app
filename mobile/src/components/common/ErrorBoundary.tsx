import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<any>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text variant="headlineSmall" style={styles.title}>
            Something went wrong
          </Text>
          <Text variant="bodyMedium" style={styles.message}>
            {this.state.error?.message}
          </Text>
          <Button
            mode="contained"
            onPress={() => this.setState({ hasError: false })}
          >
            Try Again
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  title: {
    marginBottom: 16
  },
  message: {
    marginBottom: 16,
    textAlign: 'center'
  }
});
