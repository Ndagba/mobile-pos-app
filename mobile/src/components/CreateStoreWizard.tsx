import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { Dialog, Portal, TextInput, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ApiClient from '../services/ApiClient';
import { C, R } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

type Step = 1 | 2 | 3 | 4;

interface CreatedResult {
  store: { id: string; name: string };
  admin: { username: string; email: string; first_name: string };
  password: string;
}

export default function CreateStoreWizard({ visible, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — store
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [currency, setCurrency] = useState('NGN');

  // Step 2 — first admin
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');

  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedResult | null>(null);

  const reset = () => {
    setStep(1);
    setName('');
    setAddress('');
    setPhone('');
    setCurrency('NGN');
    setAdminFirstName('');
    setAdminUsername('');
    setAdminEmail('');
    setAdminPassword('');
    setAdminPasswordConfirm('');
    setCreating(false);
    setCreated(null);
  };

  const handleClose = () => {
    onClose();
    // Reset after close animation
    setTimeout(reset, 300);
  };

  const goNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert('Required', 'Enter a store name.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!adminFirstName.trim()) {
        Alert.alert('Required', "Enter the admin's first name.");
        return;
      }
      const uname = adminUsername.trim().toLowerCase();
      if (uname.length < 3) {
        Alert.alert('Invalid Username', 'Username must be at least 3 characters.');
        return;
      }
      if (!/^[\w.-]+$/.test(uname)) {
        Alert.alert(
          'Invalid Username',
          'Use letters, numbers, dots, dashes and underscores only.'
        );
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
        Alert.alert('Invalid Email', 'Enter a valid email address.');
        return;
      }
      if (adminPassword.length < 6) {
        Alert.alert('Weak Password', 'Password must be at least 6 characters.');
        return;
      }
      if (adminPassword !== adminPasswordConfirm) {
        Alert.alert('Mismatch', 'Passwords do not match.');
        return;
      }
      setStep(3);
    }
  };

  const goBack = () => {
    if (step > 1 && step < 4) setStep((s) => (s - 1) as Step);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res: any = await ApiClient.post('/stores', {
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        currency: currency.trim().toUpperCase() || 'NGN',
        admin_first_name: adminFirstName.trim(),
        admin_username: adminUsername.trim().toLowerCase(),
        admin_email: adminEmail.trim().toLowerCase(),
        admin_password: adminPassword,
      });
      const data = res?.data ?? res;
      setCreated({
        store: { id: data.store.id, name: data.store.name },
        admin: {
          username: data.admin.username,
          email: data.admin.email,
          first_name: data.admin.first_name,
        },
        password: adminPassword,
      });
      setStep(4);
      onCreated?.();
    } catch (e: any) {
      Alert.alert(
        'Create Failed',
        e?.response?.data?.message ?? e?.message ?? 'Unknown error'
      );
    } finally {
      setCreating(false);
    }
  };

  const handleShare = async () => {
    if (!created) return;
    const lines = [
      `JayPOS — login for ${created.store.name}`,
      '',
      `Store ID:  ${created.store.id}`,
      `Username:  ${created.admin.username}`,
      `Password:  ${created.password}`,
      `Email:     ${created.admin.email}`,
      '',
      'Open the JayPOS app and sign in to manage your store.',
    ].join('\n');
    try {
      await Share.share({ message: lines, title: `JayPOS credentials — ${created.store.name}` });
    } catch {}
  };

  // ─── Step 1 — Store details ─────────────────────────────────
  const renderStoreStep = () => (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
      <Text style={styles.stepTitle}>Store details</Text>
      <Text style={styles.stepDesc}>
        Identify the client store. A store ID is auto-generated.
      </Text>

      <TextInput
        label="Store name *"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
        placeholder="e.g. Acme Mart"
      />
      <TextInput
        label="Address"
        value={address}
        onChangeText={setAddress}
        mode="outlined"
        style={styles.input}
        multiline
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
      />
      <TextInput
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        mode="outlined"
        style={styles.input}
        keyboardType="phone-pad"
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
      />
      <TextInput
        label="Currency (ISO code)"
        value={currency}
        onChangeText={(v) => setCurrency(v.toUpperCase())}
        mode="outlined"
        style={styles.input}
        autoCapitalize="characters"
        maxLength={3}
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
        placeholder="NGN"
      />
    </ScrollView>
  );

  // ─── Step 2 — First admin ───────────────────────────────────
  const renderAdminStep = () => (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
      <Text style={styles.stepTitle}>First admin</Text>
      <Text style={styles.stepDesc}>
        Create the login the new client will use to sign in.
      </Text>

      <TextInput
        label="First name *"
        value={adminFirstName}
        onChangeText={setAdminFirstName}
        mode="outlined"
        style={styles.input}
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
      />
      <TextInput
        label="Username *"
        value={adminUsername}
        onChangeText={setAdminUsername}
        mode="outlined"
        style={styles.input}
        autoCapitalize="none"
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
        placeholder="e.g. ade"
      />
      <TextInput
        label="Email *"
        value={adminEmail}
        onChangeText={setAdminEmail}
        mode="outlined"
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
      />
      <TextInput
        label="Password *"
        value={adminPassword}
        onChangeText={setAdminPassword}
        mode="outlined"
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
        placeholder="At least 6 characters"
      />
      <TextInput
        label="Confirm password *"
        value={adminPasswordConfirm}
        onChangeText={setAdminPasswordConfirm}
        mode="outlined"
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
        outlineColor={C.border}
        activeOutlineColor={C.accent}
        theme={{ colors: { background: C.card } }}
      />
    </ScrollView>
  );

  // ─── Step 3 — Review ────────────────────────────────────────
  const renderReviewStep = () => (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
      <Text style={styles.stepTitle}>Review &amp; create</Text>
      <Text style={styles.stepDesc}>
        Double-check the details. You'll be able to share the credentials right after.
      </Text>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewHeader}>Store</Text>
        <ReviewRow k="Name" v={name} />
        <ReviewRow k="Address" v={address || '—'} />
        <ReviewRow k="Phone" v={phone || '—'} />
        <ReviewRow k="Currency" v={currency} />
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewHeader}>First admin</Text>
        <ReviewRow k="Name" v={adminFirstName} />
        <ReviewRow k="Username" v={adminUsername.toLowerCase()} />
        <ReviewRow k="Email" v={adminEmail.toLowerCase()} />
        <ReviewRow k="Password" v={'•'.repeat(adminPassword.length)} />
      </View>
    </ScrollView>
  );

  // ─── Step 4 — Success ───────────────────────────────────────
  const renderSuccessStep = () => (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.successIconWrap}>
        <MaterialCommunityIcons name="check-circle" size={48} color={C.green} />
      </View>
      <Text style={[styles.stepTitle, { textAlign: 'center' }]}>
        Store created
      </Text>
      <Text style={[styles.stepDesc, { textAlign: 'center', marginBottom: 18 }]}>
        Share these credentials with the new admin so they can sign in.
      </Text>

      {created && (
        <View style={styles.credBox}>
          <CredRow k="Store" v={`${created.store.name} (${created.store.id})`} />
          <CredRow k="Username" v={created.admin.username} mono />
          <CredRow k="Password" v={created.password} mono />
          <CredRow k="Email" v={created.admin.email} mono />
        </View>
      )}

      <TouchableOpacity
        style={styles.shareBtn}
        onPress={handleShare}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="share-variant" size={16} color="#fff" />
        <Text style={styles.shareBtnText}>Share credentials</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={step === 4 ? handleClose : undefined}
        dismissable={step === 4}
        style={styles.dialog}
      >
        <Dialog.Title style={styles.dialogTitle}>
          {step === 4 ? 'Done' : 'New Store'}
        </Dialog.Title>

        <Dialog.ScrollArea style={{ maxHeight: 480, paddingHorizontal: 0 }}>
          {step === 1 && renderStoreStep()}
          {step === 2 && renderAdminStep()}
          {step === 3 && renderReviewStep()}
          {step === 4 && renderSuccessStep()}
        </Dialog.ScrollArea>

        <Dialog.Actions style={styles.actions}>
          {step === 4 ? (
            <Button onPress={handleClose} mode="contained" textColor="#fff" buttonColor={C.accent}>
              Done
            </Button>
          ) : (
            <>
              {step === 1 ? (
                <Button onPress={handleClose} textColor={C.muted} disabled={creating}>
                  Cancel
                </Button>
              ) : (
                <Button onPress={goBack} textColor={C.muted} disabled={creating}>
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button onPress={goNext} textColor={C.accent}>
                  Next
                </Button>
              ) : (
                <Button
                  onPress={handleCreate}
                  loading={creating}
                  disabled={creating}
                  textColor={C.accent}
                >
                  Create Store
                </Button>
              )}
            </>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// ─── Helpers ────────────────────────────────────────────────────
function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewKey}>{k}</Text>
      <Text style={styles.reviewVal} numberOfLines={2}>{v}</Text>
    </View>
  );
}

function CredRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={styles.credRow}>
      <Text style={styles.credKey}>{k}</Text>
      <Text
        style={[
          styles.credVal,
          mono && {
            fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
          },
        ]}
        selectable
      >
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dialog: {
    borderRadius: 20,
    marginHorizontal: 16,
    backgroundColor: C.card,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    paddingBottom: 16,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.muted,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
    marginTop: 4,
  },
  stepDesc: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
  },
  input: {
    marginBottom: 10,
    backgroundColor: C.card,
  },
  reviewSection: {
    backgroundColor: C.bg,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 12,
  },
  reviewHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.muted,
    marginBottom: 8,
  },
  reviewRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  reviewKey: {
    width: 96,
    fontSize: 12,
    color: C.muted,
  },
  reviewVal: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    fontWeight: '600',
  },
  successIconWrap: {
    alignItems: 'center',
    marginVertical: 12,
  },
  credBox: {
    backgroundColor: C.bg,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 16,
  },
  credRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  credKey: {
    width: 84,
    fontSize: 12,
    color: C.muted,
  },
  credVal: {
    flex: 1,
    fontSize: 13,
    color: C.ink,
    fontWeight: '600',
  },
  shareBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  actions: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
});
