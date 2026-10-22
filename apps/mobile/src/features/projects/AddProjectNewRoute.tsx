import type { StaticScreenProps } from "@react-navigation/native";
import { AddProjectNewScreen } from "./AddProjectScreen";

type AddProjectNewRouteParams = {
  readonly machineId?: string | string[];
};

export function AddProjectNewRoute({
  route,
}: StaticScreenProps<AddProjectNewRouteParams | undefined>) {
  return <AddProjectNewScreen {...(route.params ?? {})} />;
}
