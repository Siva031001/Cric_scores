import React, { useEffect, useState } from "react";
import { View, Text, FlatList } from "react-native";
import database from "@react-native-firebase/database";

export default function CommentaryScreen({ route }: any) {
  const { matchId } = route.params;
  const [list, setList] = useState([]);

  useEffect(() => {
    const ref = database().ref(`matches/${matchId}/commentary`);
    const sub = ref.on("value", snap => {
      setList(snap.val() || []);
    });
    return () => ref.off("value", sub);
  }, []);

  return (
    <FlatList
      data={list}
      renderItem={({ item }) => <Text>{item}</Text>}
    />
  );
}
