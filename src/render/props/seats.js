// Where a rider sits on a two-wheeler, shared by the vehicle models (src/render/props)
// and the riders' poses (src/render/people): the seat's height above the road, and how
// far behind the vehicle's origin (its centre on the ground) the rider's hips are.
// A pillion passenger sits `pillion` further back. Adult hips are HIP_HEIGHT above the feet.
export const HIP_HEIGHT = 1.85;
export const SEATS = {
  scooter: { y: 1.92, back: 0.62, pillion: 0.62 },
  bicycle: { y: 2.12, back: 0.5, pillion: 0 }
};
