import messaging from "@react-native-firebase/messaging";

export const getToken = async () => {
  await messaging().requestPermission();
  const token = await messaging().getToken();
  console.log("FCM TOKEN:", token);
  return token;
};