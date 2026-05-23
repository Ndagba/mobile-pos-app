import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';

interface LoadingSpinnerProps {
  loading: boolean;
  message?: string;
  children?: React.ReactNode;
}

export default function LoadingSpinner({ loading, message, children }: LoadingSpinnerProps) {
  if (!loading) return <>{children}</>;

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  message: {
    marginTop: 16,
    textAlign: 'center'
  }
});
