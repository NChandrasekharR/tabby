import { PALETTE, uid } from "./constants";

// First-load worksheet: a worked example with people already assigned.
export function makeSeed() {
  const people = [
    { id: "p1", name: "Riya", color: PALETTE[0] },
    { id: "p2", name: "Arjun", color: PALETTE[1] },
    { id: "p3", name: "Sam", color: PALETTE[2] },
  ];
  const items = [
    { id: uid(), name: "Paneer Tikka", price: "340", split: "shared", assignedTo: [] },
    { id: uid(), name: "Lime Soda ×3", price: "240", split: "shared", assignedTo: [] },
    { id: uid(), name: "Veg Biryani", price: "280", split: "assigned", assignedTo: ["p2"] },
    { id: uid(), name: "Masala Dosa", price: "180", split: "assigned", assignedTo: ["p3"] },
    { id: uid(), name: "Butter Naan ×2", price: "120", split: "assigned", assignedTo: ["p1", "p2"] },
  ];
  return { people, items };
}

// Demo items for a fresh group — all Shared so they don't reference seed IDs.
export function demoItems() {
  return [
    { id: uid(), name: "Paneer Tikka", price: "340", split: "shared", assignedTo: [] },
    { id: uid(), name: "Lime Soda ×3", price: "240", split: "shared", assignedTo: [] },
    { id: uid(), name: "Veg Biryani", price: "280", split: "shared", assignedTo: [] },
    { id: uid(), name: "Masala Dosa", price: "180", split: "shared", assignedTo: [] },
    { id: uid(), name: "Butter Naan ×2", price: "120", split: "shared", assignedTo: [] },
  ];
}
