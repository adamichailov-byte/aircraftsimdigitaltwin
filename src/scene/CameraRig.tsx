import { useEffect, useRef } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { homePositionM, homeTargetM } from '../demo/campus';
import { zones } from '../demo/zones';
import { advanceFocus, cameraTargetMoved, cancelFocus, fitCameraToBounds, focusTo, syncFocusPose,
  fitCameraToObject, moveFocusWithTarget, type CameraFocusState, type CameraPose, type Vec3 } from './camera-focus';

export type CameraCommand = { type: 'home' } | { type: 'focus'; zoneId: string }
  | { type: 'track'; entityId: string; positionM: Vec3; sizeM: Vec3 }
  | { type: 'move'; action: 'in' | 'out' | 'left' | 'right' | 'up' | 'down' };
export type CameraCommandHandle = { run: (command: CameraCommand) => void };

type TrackedEntity = { entityId: string; positionM: Vec3; sizeM: Vec3; targetM: Vec3 };

export function CameraRig({ commands, panelWidth, rightPanelWidth, onManualPan, movementKeys, resolveEntityPose }: {
  commands: RefObject<CameraCommandHandle | null>; panelWidth: number; rightPanelWidth: number; onManualPan: () => void;
  movementKeys: Set<string>;
  resolveEntityPose?: (id: string) => Vec3 | null;
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const transition = useRef<CameraFocusState>({ pose: { position: homePositionM, target: homeTargetM }, transition: null });
  const activeFocusZone = useRef<string | null>(null);
  const trackedEntity = useRef<TrackedEntity | null>(null);
  const manualStart = useRef<CameraPose | null>(null);
  const keyboardPanActive = useRef(false);
  const { camera, gl, invalidate, size, clock } = useThree();
  const perspective = camera as PerspectiveCamera;
  const previousSize = useRef([size.width, size.height, panelWidth, rightPanelWidth]);

  useFrame((_, delta) => {
    const forwardAmount = Number(movementKeys.has('w')) - Number(movementKeys.has('s'));
    const rightAmount = Number(movementKeys.has('d')) - Number(movementKeys.has('a'));
    if ((forwardAmount !== 0 || rightAmount !== 0) && controls.current) {
      if (!keyboardPanActive.current) {
        interrupt();
        activeFocusZone.current = null;
        trackedEntity.current = null;
        manualStart.current = null;
        onManualPan();
        keyboardPanActive.current = true;
      }
      const forward = camera.getWorldDirection(new Vector3()).setY(0).normalize();
      const right = new Vector3().crossVectors(forward, camera.up).setY(0).normalize();
      const offset = forward.multiplyScalar(forwardAmount).add(right.multiplyScalar(rightAmount));
      if (offset.lengthSq() > 0) {
        const speedMps = Math.max(8, Math.min(70, camera.position.distanceTo(controls.current.target) * 0.15)) * 1.3;
        offset.normalize().multiplyScalar(speedMps * Math.min(delta, 0.05));
        controls.current.target.add(offset);
        camera.position.add(offset);
        controls.current.update();
        transition.current = syncFocusPose(currentPose());
      }
      return;
    }
    keyboardPanActive.current = false;
    const tracked = trackedEntity.current;
    if (tracked && controls.current) {
      const storyPosition = resolveEntityPose?.(tracked.entityId) ?? null;
      const nextTarget: Vec3 = [storyPosition?.[0] ?? tracked.positionM[0],
        tracked.positionM[1] + tracked.sizeM[1] * 0.4,
        storyPosition?.[2] ?? tracked.positionM[2]];
      const offset: Vec3 = [nextTarget[0] - tracked.targetM[0], nextTarget[1] - tracked.targetM[1],
        nextTarget[2] - tracked.targetM[2]];
      if (Math.hypot(...offset) > 0.001) {
        trackedEntity.current = { ...tracked, targetM: nextTarget };
        transition.current = moveFocusWithTarget(transition.current, offset);
        if (!transition.current.transition) {
          camera.position.set(...transition.current.pose.position);
          controls.current.target.set(...transition.current.pose.target);
          controls.current.update();
        }
      }
    }
    if (!transition.current.transition) return;
    const next = advanceFocus(transition.current, clock.elapsedTime * 1000);
    transition.current = next.state;
    camera.position.set(...next.state.pose.position);
    controls.current?.target.set(...next.state.pose.target);
    controls.current?.update();
    if (!next.completed) invalidate();
  });

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const now = () => clock.elapsedTime * 1000;
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apply = (destination: { position: [number, number, number]; target: [number, number, number] }) => {
      transition.current = focusTo(transition.current, destination, now(), 680, reducedMotion());
      if (transition.current.transition) invalidate();
      else {
        camera.position.set(...destination.position);
        orbit.target.set(...destination.target);
        orbit.update();
        invalidate();
      }
    };
    commands.current = { run(command) {
      if (command.type === 'home') {
        activeFocusZone.current = null;
        trackedEntity.current = null;
        apply({ position: homePositionM, target: homeTargetM });
        return;
      }
      if (command.type === 'focus') {
        trackedEntity.current = null;
        const zone = zones.find(candidate => candidate.id === command.zoneId);
        if (!zone?.focusCenterM || !zone.focusSizeM) return;
        activeFocusZone.current = zone.id;
        const fit = fitCameraToBounds(zone.focusCenterM, zone.focusSizeM, size.width, size.height, panelWidth, perspective.fov, undefined, rightPanelWidth);
        apply({ position: fit.position, target: fit.target });
        return;
      }
      if (command.type === 'track') {
        activeFocusZone.current = null;
        const storyPosition = resolveEntityPose?.(command.entityId) ?? null;
        const targetM: Vec3 = [storyPosition?.[0] ?? command.positionM[0],
          command.positionM[1] + command.sizeM[1] * 0.4,
          storyPosition?.[2] ?? command.positionM[2]];
        trackedEntity.current = { entityId: command.entityId, positionM: command.positionM,
          sizeM: command.sizeM, targetM };
        apply(fitCameraToObject([targetM[0], command.positionM[1], targetM[2]], command.sizeM, size.width, size.height,
          panelWidth, perspective.fov, undefined, rightPanelWidth));
        return;
      }
      activeFocusZone.current = null;
      trackedEntity.current = null;
      transition.current = transition.current.transition
        ? cancelFocus(transition.current, now())
        : syncFocusPose(currentPose());
      camera.position.set(...transition.current.pose.position);
      orbit.target.set(...transition.current.pose.target);
      if (command.action === 'in' || command.action === 'out') {
        const offset = camera.position.clone().sub(orbit.target);
        const distance = Math.max(24, Math.min(2300, offset.length() * (command.action === 'in' ? 0.8 : 1.25)));
        camera.position.copy(orbit.target).add(offset.setLength(distance));
      } else {
        const offset = new Vector3(command.action === 'left' ? -20 : command.action === 'right' ? 20 : 0,
          0, command.action === 'up' ? -20 : command.action === 'down' ? 20 : 0);
        orbit.target.add(offset);
        camera.position.add(offset);
        onManualPan();
      }
      orbit.update();
      transition.current = syncFocusPose(currentPose());
      invalidate();
    } };
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Interactive 3D aircraft campus. WASD or arrow keys pan, plus and minus zoom, Home resets the view.');
    const layout = [size.width, size.height, panelWidth, rightPanelWidth];
    const resized = layout.some((value, index) => value !== previousSize.current[index]);
    previousSize.current = layout;
    if (resized && trackedEntity.current) {
      const tracked = trackedEntity.current;
      const storyPosition = resolveEntityPose?.(tracked.entityId) ?? null;
      const targetM: Vec3 = [storyPosition?.[0] ?? tracked.positionM[0],
        tracked.positionM[1] + tracked.sizeM[1] * 0.4,
        storyPosition?.[2] ?? tracked.positionM[2]];
      trackedEntity.current = { ...tracked, targetM };
      apply(fitCameraToObject([targetM[0], tracked.positionM[1], targetM[2]], tracked.sizeM, size.width, size.height, panelWidth,
        perspective.fov, undefined, rightPanelWidth));
    } else if (resized && activeFocusZone.current) {
      const zone = zones.find(candidate => candidate.id === activeFocusZone.current);
      if (zone?.focusCenterM && zone.focusSizeM) {
        const fit = fitCameraToBounds(zone.focusCenterM, zone.focusSizeM, size.width, size.height, panelWidth, perspective.fov, undefined, rightPanelWidth);
        apply({ position: fit.position, target: fit.target });
      }
    }
    return () => { commands.current = null; };
  }, [camera, clock, commands, gl, invalidate, panelWidth, rightPanelWidth, perspective.fov, size.height, size.width, resolveEntityPose]);

  function interrupt() {
    if (transition.current.transition) {
      transition.current = cancelFocus(transition.current, clock.elapsedTime * 1000);
      camera.position.set(...transition.current.pose.position);
      if (controls.current) controls.current.target.set(...transition.current.pose.target);
    } else {
      transition.current = syncFocusPose(currentPose());
    }
    // OrbitControls keeps spherical state between input events. Rebase that state
    // after a scripted camera move or the first user drag can restore an old pose.
    controls.current?.update();
  }
  function currentPose(): CameraPose {
    return { position: camera.position.toArray() as [number, number, number],
      target: (controls.current?.target.toArray() ?? homeTargetM) as [number, number, number] };
  }
  function beginManualControl() {
    interrupt();
    // User orbit/zoom/pan owns the view from this point, including small wheel steps.
    trackedEntity.current = null;
    const target = controls.current?.target;
    if (target) manualStart.current = { position: camera.position.toArray() as [number, number, number],
      target: target.toArray() as [number, number, number] };
  }
  function trackManualChange() {
    invalidate();
    if (!transition.current.transition) transition.current = syncFocusPose(currentPose());
    const start = manualStart.current;
    const target = controls.current?.target;
    if (!start || !target || !cameraTargetMoved(start.target, target.toArray() as [number, number, number])) return;
    manualStart.current = null;
    activeFocusZone.current = null;
    trackedEntity.current = null;
    onManualPan();
  }
  return <OrbitControls ref={controls} makeDefault target={homeTargetM} enableDamping={false}
    screenSpacePanning={false} minDistance={24} maxDistance={2300} minPolarAngle={0.15}
    maxPolarAngle={1.42} rotateSpeed={0.65} zoomSpeed={0.8} panSpeed={0.7}
    onStart={beginManualControl} onEnd={() => { manualStart.current = null; }} onChange={trackManualChange} />;
}
