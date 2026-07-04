import auth from "@react-native-firebase/auth";

useEffect(() => {
  const unsubscribe = auth().onAuthStateChanged(user => {
    if (user) {
      navigation.replace("Home");
    } else {
      navigation.replace("Login");
    }
  });
  return unsubscribe;
}, []);