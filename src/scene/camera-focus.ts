export type Vec3 = [number, number, number];

export type CameraPose = {
  position: Vec3;
  target: Vec3;
};

export function cameraTargetMoved(from: Vec3, to: Vec3, thresholdM = 0.025): boolean {
  return Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1]), Math.abs(from[2] - to[2])) > thresholdM;
}

export type CameraTransition = {
  from: CameraPose;
  to: CameraPose;
  startedAtMs: number;
  durationMs: number;
};

export type CameraFocusState = {
  pose: CameraPose;
  transition: CameraTransition | null;
};

export type CameraFit = {
  target: Vec3;
  position: Vec3;
  distance: number;
};

function copyPose(pose: CameraPose): CameraPose {
  return { position: [...pose.position], target: [...pose.target] };
}

export function syncFocusPose(pose: CameraPose): CameraFocusState {
  return { pose: copyPose(pose), transition: null };
}

function mix(from: Vec3, to: Vec3, amount: number): Vec3 {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

export function advanceFocus(state: CameraFocusState, nowMs: number): {
  state: CameraFocusState;
  completed: boolean;
} {
  const transition = state.transition;
  if (!transition) return { state, completed: true };

  const linear = Math.max(0, Math.min(1, (nowMs - transition.startedAtMs) / transition.durationMs));
  const eased = linear * linear * (3 - 2 * linear);
  const pose = {
    position: mix(transition.from.position, transition.to.position, eased),
    target: mix(transition.from.target, transition.to.target, eased),
  };
  return {
    state: linear >= 1 ? { pose: copyPose(transition.to), transition: null } : { pose, transition },
    completed: linear >= 1,
  };
}

export function focusTo(
  current: CameraFocusState,
  destination: CameraPose,
  nowMs: number,
  durationMs = 680,
  reducedMotion = false,
): CameraFocusState {
  const from = current.transition ? advanceFocus(current, nowMs).state.pose : current.pose;
  if (reducedMotion) return { pose: copyPose(destination), transition: null };
  return {
    pose: copyPose(from),
    transition: {
      from: copyPose(from),
      to: copyPose(destination),
      startedAtMs: nowMs,
      durationMs: Math.max(1, durationMs),
    },
  };
}

export function cancelFocus(current: CameraFocusState, nowMs: number): CameraFocusState {
  const pose = current.transition ? advanceFocus(current, nowMs).state.pose : current.pose;
  return { pose: copyPose(pose), transition: null };
}

export function fitCameraToBounds(
  centerM: [number, number],
  boundsM: [number, number],
  viewportWidth: number,
  viewportHeight: number,
  coveredWidth = 0,
  verticalFovDegrees = 40,
  cameraDirection: Vec3 = [0.42, 0.34, 0.84],
  rightCoveredWidth = 0,
): CameraFit {
  const width = Math.max(1, viewportWidth);
  const height = Math.max(1, viewportHeight);
  const aspect = width / height;
  const halfVertical = verticalFovDegrees * Math.PI / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const clearFraction = Math.max(0.32, 1 - Math.min(width * 0.68, coveredWidth + rightCoveredWidth) / width);
  const diagonal = Math.hypot(boundsM[0], boundsM[1]);
  const widthDistance = diagonal / (2 * Math.tan(halfHorizontal) * clearFraction) * 1.18;
  const heightDistance = 32 / (2 * Math.tan(halfVertical)) * 1.18;
  const distance = Math.max(70, widthDistance, heightDistance);

  const directionLength = Math.hypot(...cameraDirection);
  const direction = cameraDirection.map(value => value / directionLength) as Vec3;
  const rightLength = Math.hypot(direction[2], direction[0]);
  const right: Vec3 = [direction[2] / rightLength, 0, -direction[0] / rightLength];
  const screenOffsetM = distance * Math.tan(halfHorizontal) * (coveredWidth - rightCoveredWidth) / width;
  const target: Vec3 = [
    centerM[0] - right[0] * screenOffsetM,
    8,
    centerM[1] - right[2] * screenOffsetM,
  ];
  const position: Vec3 = [
    target[0] + direction[0] * distance,
    target[1] + direction[1] * distance,
    target[2] + direction[2] * distance,
  ];
  return { target, position, distance };
}
