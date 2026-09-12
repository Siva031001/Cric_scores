import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export const subscribeToNetworkHealth = (callback: (status: 'Excellent'|'Good'|'Poor'|'Disconnected') => void) => {
  return NetInfo.addEventListener((state: NetInfoState) => {
    if (!state.isConnected) {
      callback('Disconnected');
      return;
    }
    const type = state.type;
    if (type === 'wifi' || type === 'ethernet') callback('Excellent');
    else if (type === 'cellular') {
      // Cellular connections never carry a signal `strength` field (that
      // only exists on wifi's details, on any platform) — the real signal
      // proxy NetInfo gives us here is cellularGeneration, which IS
      // available cross-platform (unlike wifi strength, which is
      // Android-only). 4g/5g is good enough for streaming; 2g/3g or an
      // unknown generation is treated as poor, matching what this status
      // is actually used for (StreamingDashboardScreen's weak-connection
      // warning).
      const cellularGeneration = (state.details as any)?.cellularGeneration;
      callback(cellularGeneration === '4g' || cellularGeneration === '5g' ? 'Good' : 'Poor');
    }
    else callback('Good');
  });
};