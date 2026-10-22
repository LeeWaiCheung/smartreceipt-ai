import { Utensils,TrainFront,BriefcaseBusiness,Layers,Zap,Plane,MoreHorizontal } from "lucide-react";
import type { CategoryId } from "@/lib/types";
const icons={food:Utensils,transport:TrainFront,office:BriefcaseBusiness,software:Layers,utilities:Zap,travel:Plane,other:MoreHorizontal};
export function CategoryIcon({category,size=18}:{category:CategoryId;size?:number}) {
  const Icon=icons[category] || MoreHorizontal;
  return <Icon size={size} strokeWidth={1.7}/>;
}
