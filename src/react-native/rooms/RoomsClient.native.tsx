import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from '@/hooks/useRouter'; // Adjust to your navigation solution

// Helper to generate a random room code
const randomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

export function RoomsClient({ code: roomCode, isHost }: { code: string; isHost: boolean }) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState(() => {
    // On native there is no window/sessionStorage – replace with async storage if needed.
    // For now we just default to empty.
    return '';
  });

  // Create a new room and navigate to it
  const createRoom = () => {
    if (!displayName.trim()) return;
    const newCode = randomCode();
    // Replace with your navigation method, e.g. navigation.navigate('Room', { code: newCode, host: true })
    router.push(`/rooms?code=${newCode}&host=1`);
  };

  // Join an existing room
  const joinRoom = () => {
    const clean = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean && displayName.trim()) {
      router.push(`/rooms?code=${clean}`);
    } else {
      Alert.alert('Missing information', 'Please provide a name and room code.');
    }
  };

  return (
    <View style={styles.container}>
      {!roomCode ? (
        <View>
          <Text style={styles.title}>Create a room</Text>
          <TextInput
            placeholder="Your name"
            value={displayName}
            onChangeText={t => setDisplayName(t.slice(0, 32))}
            style={styles.input}
          />
          <TouchableOpacity
            onPress={createRoom}
            disabled={!displayName.trim()}
            style={[styles.button, !displayName.trim() && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>Create room</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Join a room</Text>
          <TextInput
            placeholder="ROOM CODE"
            value={joinCode}
            onChangeText={t => setJoinCode(t.toUpperCase())}
            style={styles.input}
            maxLength={12}
          />
          <TouchableOpacity
            onPress={joinRoom}
            disabled={!joinCode.trim() || !displayName.trim()}
            style={[styles.button, (!joinCode.trim() || !displayName.trim()) && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>Join</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text>Room UI for mobile is under construction.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginVertical: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#a1a1aa',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
