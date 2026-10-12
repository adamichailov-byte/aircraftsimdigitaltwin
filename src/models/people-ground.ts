export const technicianGround = {
  slabY: 0.7,
  rootY: 0.7,
  legPivotY: 0.72,
  lowerLegHeight: 0.66,
  footCenterBelowLegPivot: 0.65,
  footHeight: 0.1,
} as const;

export function technicianGroundContact() {
  const footBottom = technicianGround.rootY + technicianGround.legPivotY
    - technicianGround.footCenterBelowLegPivot - technicianGround.footHeight / 2;
  return { rootY: technicianGround.rootY, clearance: footBottom - technicianGround.slabY };
}
