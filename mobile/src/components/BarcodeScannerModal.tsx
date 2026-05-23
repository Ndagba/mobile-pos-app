import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
}

export default function BarcodeScannerModal({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  // Single-shot per open: prevent the same scan from firing the callback repeatedly.
  const [armed, setArmed] = useState(true);

  useEffect(() => {
    if (visible) setArmed(true);
  }, [visible]);

  const handleScanned = ({ data }: { data: string }) => {
    if (!armed) return;
    setArmed(false);
    onScanned(data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.center}>
            <Text style={styles.text}>Loading camera…</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="camera-off" size={48} color="#fff" />
            <Text style={styles.text}>
              Camera permission is required to scan barcodes.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={requestPermission}>
              <Text style={styles.btnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={onClose}>
              <Text style={styles.linkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: [
                'qr',
                'ean13',
                'ean8',
                'upc_a',
                'upc_e',
                'code128',
                'code39',
                'code93',
                'codabar',
                'itf14',
                'pdf417',
              ],
            }}
            onBarcodeScanned={armed ? handleScanned : undefined}
          />
        )}

        {/* Overlay UI */}
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>Scan Barcode</Text>
            <View style={{ width: 40 }} />
          </View>

          {permission?.granted && (
            <>
              <View style={styles.frameWrap}>
                <View style={styles.frame} />
              </View>
              <Text style={styles.hint}>Align the barcode within the frame</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  text: { color: '#fff', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn: {
    backgroundColor: C.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: { color: '#fff', fontWeight: '700' },
  linkBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  linkText: { color: '#fff', fontSize: 14, opacity: 0.8 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-start' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 50,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  frameWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 260,
    height: 160,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 16,
  },
  hint: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.85,
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
});
