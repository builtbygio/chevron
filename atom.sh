#!/bin/bash

if [ "$(uname)" == 'Darwin' ]; then
  OS='Mac'
elif [ "$(expr substr $(uname -s) 1 5)" == 'Linux' ]; then
  OS='Linux'
else
  echo "Your platform ($(uname -a)) is not supported."
  exit 1
fi

case $(basename $0) in
  atom-beta|chevron-beta)
    CHANNEL=beta
    ;;
  atom-nightly|chevron-nightly)
    CHANNEL=nightly
    ;;
  atom-dev|chevron-dev)
    CHANNEL=dev
    ;;
  *)
    CHANNEL=stable
    ;;
esac

# Only set the ATOM_DISABLE_SHELLING_OUT_FOR_ENVIRONMENT env var if it hasn't been set.
if [ -z "$ATOM_DISABLE_SHELLING_OUT_FOR_ENVIRONMENT" ]
then
  export ATOM_DISABLE_SHELLING_OUT_FOR_ENVIRONMENT=true
fi

ATOM_ADD=false
ATOM_NEW_WINDOW=false
EXIT_CODE_OVERRIDE=

while getopts ":anwtfvh-:" opt; do
  case "$opt" in
    -)
      case "${OPTARG}" in
        add)
          ATOM_ADD=true
          ;;
        new-window)
          ATOM_NEW_WINDOW=true
          ;;
        wait)
          WAIT=1
          ;;
        help|version)
          REDIRECT_STDERR=1
          EXPECT_OUTPUT=1
          ;;
        foreground|benchmark|benchmark-test|test)
          EXPECT_OUTPUT=1
          ;;
        enable-electron-logging)
          export ELECTRON_ENABLE_LOGGING=1
          ;;
      esac
      ;;
    a)
      ATOM_ADD=true
      ;;
    n)
      ATOM_NEW_WINDOW=true
      ;;
    w)
      WAIT=1
      ;;
    h|v)
      REDIRECT_STDERR=1
      EXPECT_OUTPUT=1
      ;;
    f|t)
      EXPECT_OUTPUT=1
      ;;
  esac
done

if [ "${ATOM_ADD}" = "true" ] && [ "${ATOM_NEW_WINDOW}" = "true" ]; then
  EXPECT_OUTPUT=1
  EXIT_CODE_OVERRIDE=1
fi

if [ $REDIRECT_STDERR ]; then
  exec 2> /dev/null
fi

ATOM_HOME="${ATOM_HOME:-$HOME/.atom}"
mkdir -p "$ATOM_HOME"

if [ $OS == 'Mac' ]; then
  if [ -L "$0" ]; then
    SCRIPT="$(readlink "$0")"
  else
    SCRIPT="$0"
  fi
  ATOM_APP="$(dirname "$(dirname "$(dirname "$(dirname "$SCRIPT")")")")"
  if [ "$ATOM_APP" == . ]; then
    unset ATOM_APP
  else
    ATOM_PATH="$(dirname "$ATOM_APP")"
    ATOM_APP_NAME="$(basename "$ATOM_APP")"
  fi

  if [ ! -z "${ATOM_APP_NAME}" ]; then
    # If ATOM_APP_NAME is known, use it as the executable name
    ATOM_EXECUTABLE_NAME="${ATOM_APP_NAME%.*}"
  else
    # Prefer Chevron.app; keep Atom.app names as legacy fallbacks.
    if [ "$CHANNEL" == 'beta' ]; then
      ATOM_APP_NAME="Chevron Beta.app"
      ATOM_EXECUTABLE_NAME="Chevron Beta"
    elif [ "$CHANNEL" == 'nightly' ]; then
      ATOM_APP_NAME="Chevron Nightly.app"
      ATOM_EXECUTABLE_NAME="Chevron Nightly"
    elif [ "$CHANNEL" == 'dev' ]; then
      ATOM_APP_NAME="Chevron Dev.app"
      ATOM_EXECUTABLE_NAME="Chevron Dev"
    else
      ATOM_APP_NAME="Chevron.app"
      ATOM_EXECUTABLE_NAME="Chevron"
    fi
  fi

  if [ -z "${ATOM_PATH}" ]; then
    # Prefer Chevron.app under /Applications, then legacy Atom.app.
    if [ -x "/Applications/$ATOM_APP_NAME" ]; then
      ATOM_PATH="/Applications"
    elif [ -x "$HOME/Applications/$ATOM_APP_NAME" ]; then
      ATOM_PATH="$HOME/Applications"
    elif [ -x "/Applications/Atom.app" ] && [ "$CHANNEL" == 'stable' ]; then
      ATOM_PATH="/Applications"
      ATOM_APP_NAME="Atom.app"
      ATOM_EXECUTABLE_NAME="Atom"
    elif [ -x "$HOME/Applications/Atom.app" ] && [ "$CHANNEL" == 'stable' ]; then
      ATOM_PATH="$HOME/Applications"
      ATOM_APP_NAME="Atom.app"
      ATOM_EXECUTABLE_NAME="Atom"
    else
      # Prefer Chevron bundle id; fall back to legacy Atom id.
      ATOM_PATH="$(mdfind "kMDItemCFBundleIdentifier == 'dev.builtbygio.chevron'" | grep -v ShipIt | head -1 | xargs -0 dirname)"
      if [ ! -x "$ATOM_PATH/$ATOM_APP_NAME" ]; then
        ATOM_PATH="$(mdfind "kMDItemCFBundleIdentifier == 'com.github.atom'" | grep -v ShipIt | head -1 | xargs -0 dirname)"
        if [ -n "$ATOM_PATH" ] && [ "$CHANNEL" == 'stable' ]; then
          ATOM_APP_NAME="Atom.app"
          ATOM_EXECUTABLE_NAME="Atom"
        fi
      fi

      if [ ! -x "$ATOM_PATH/$ATOM_APP_NAME" ]; then
        echo "Cannot locate ${ATOM_APP_NAME}, it is usually located in /Applications. Set the ATOM_PATH environment variable to the directory containing ${ATOM_APP_NAME}."
        exit 1
      fi
    fi
  fi

  if [ $EXPECT_OUTPUT ]; then
    "$ATOM_PATH/$ATOM_APP_NAME/Contents/MacOS/$ATOM_EXECUTABLE_NAME" --executed-from="$(pwd)" --pid=$$ "$@"
    ATOM_EXIT=$?
    if [ ${ATOM_EXIT} -eq 0 ] && [ -n "${EXIT_CODE_OVERRIDE}" ]; then
      exit "${EXIT_CODE_OVERRIDE}"
    else
      exit ${ATOM_EXIT}
    fi
  else
    open -a "$ATOM_PATH/$ATOM_APP_NAME" -n --args --executed-from="$(pwd)" --pid=$$ --path-environment="$PATH" "$@"
  fi
elif [ $OS == 'Linux' ]; then
  SCRIPT=$(readlink -f "$0")
  USR_DIRECTORY=$(readlink -f $(dirname $SCRIPT)/..)

  # Deb/rpm install to /usr/share/<channelName>/<executableName>
  # (chevron/chevron, chevron-beta/chevron-beta, …). Keep legacy atom paths as fallback.
  case $CHANNEL in
    beta)
      ATOM_PATH="$USR_DIRECTORY/share/chevron-beta/chevron-beta"
      [ -x "$ATOM_PATH" ] || ATOM_PATH="$USR_DIRECTORY/share/atom-beta/atom"
      ;;
    nightly)
      ATOM_PATH="$USR_DIRECTORY/share/chevron-nightly/chevron-nightly"
      [ -x "$ATOM_PATH" ] || ATOM_PATH="$USR_DIRECTORY/share/atom-nightly/atom"
      ;;
    dev)
      ATOM_PATH="$USR_DIRECTORY/share/chevron-dev/chevron-dev"
      [ -x "$ATOM_PATH" ] || ATOM_PATH="$USR_DIRECTORY/share/atom-dev/atom"
      ;;
    *)
      ATOM_PATH="$USR_DIRECTORY/share/chevron/chevron"
      [ -x "$ATOM_PATH" ] || ATOM_PATH="$USR_DIRECTORY/share/atom/atom"
      ;;
  esac

  #Will allow user to get context menu on cinnamon desktop enviroment
  if [[ "$(expr substr $(printenv | grep "DESKTOP_SESSION=") 17 8)" == "cinnamon" ]]; then
    cp "resources/linux/desktopenviroment/cinnamon/atom.nemo_action" "/usr/share/nemo/actions/atom.nemo_action"
  fi

  : ${TMPDIR:=/tmp}

  [ -x "$ATOM_PATH" ] || ATOM_PATH="$TMPDIR/atom-build/Atom/atom"
  [ -x "$ATOM_PATH" ] || ATOM_PATH="$TMPDIR/atom-build/Chevron/chevron"

  if [ $EXPECT_OUTPUT ]; then
    "$ATOM_PATH" --executed-from="$(pwd)" --pid=$$ "$@"
    ATOM_EXIT=$?
    if [ ${ATOM_EXIT} -eq 0 ] && [ -n "${EXIT_CODE_OVERRIDE}" ]; then
      exit "${EXIT_CODE_OVERRIDE}"
    else
      exit ${ATOM_EXIT}
    fi
  else
    (
    nohup "$ATOM_PATH" --executed-from="$(pwd)" --pid=$$ "$@" > "$ATOM_HOME/nohup.out" 2>&1
    if [ $? -ne 0 ]; then
      cat "$ATOM_HOME/nohup.out"
      exit $?
    fi
    ) &
  fi
fi

# Exits this process when Atom is used as $EDITOR
on_die() {
  exit 0
}
trap 'on_die' SIGQUIT SIGTERM

# If the wait flag is set, don't exit this process until Atom kills it.
if [ $WAIT ]; then
  WAIT_FIFO="$ATOM_HOME/.wait_fifo"

  if [ ! -p "$WAIT_FIFO" ]; then
    rm -f "$WAIT_FIFO"
    mkfifo "$WAIT_FIFO"
  fi

  # Block endlessly by reading from a named pipe.
  exec 2>/dev/null
  read < "$WAIT_FIFO"

  # If the read completes for some reason, fall back to sleeping in a loop.
  while true; do
    sleep 1
  done
fi
