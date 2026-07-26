import NetInfo, { NetInfoState } from '@react-native-community/netinfo'; // requires: npm install @react-native-community/netinfo

export const subscribeToNetworkHealth = (callback: (status: 'Excellent'|'Good'|'Poor'|'Disconnected') => void) => {
  return NetInfo.addEventListener((state: NetInfoState) => {
    if (!state.isConnected) return callback('Disconnected');
    const type = state.type;
    const strength = (state.details as any)?.strength;
    if (type === 'wifi' || type === 'ethernet') callback('Excellent');
    else if (type === 'cellular' && strength != null && strength > 60) callback('Good');
    else if (type === 'cellular') callback('Poor');
    else callback('Good');
  });
};