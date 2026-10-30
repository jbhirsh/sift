# Sourced, not run: exports eas.json's e2e-simulator profile env (the
# EXPO_PUBLIC_* settings the E2E app is built with) and lists them, for
# build-simulator-app.sh (the native app) and bundle-js.sh (its JavaScript
# alone), so the two can't drift. Read as NUL-separated KEY=value pairs (no
# shell quoting to get wrong), exported one by one.
profile_env="$(mktemp)"
node -e '
  const env = require("./eas.json").build["e2e-simulator"].env ?? {};
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`Unexpected env name in eas.json: ${key}`);
    process.stdout.write(`${key}=${value}\0`);
  }
' > "$profile_env"
while IFS= read -r -d '' pair; do
  export "$pair"
  echo "  ${pair%%=*}=${pair#*=}"
done < "$profile_env"
rm -f "$profile_env"
