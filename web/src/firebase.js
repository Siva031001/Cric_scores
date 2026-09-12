// Firebase Web SDK init — same project as the RN app and as admin/src/main.jsx.
// This is the standard public web API key for this Firebase project (not a
// secret; Firebase's own security model is enforced by database rules, not
// by hiding this config — admin/ already ships this exact config today).
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const app = initializeApp({
  apiKey: 'AIzaSyCj3IUUqhOKKvfMX1OcPI_Pd7uZtXZaqLw',
  databaseURL: 'https://crik-runs-default-rtdb.asia-southeast1.firebasedatabase.app',
});

export const db = getDatabase(app);
