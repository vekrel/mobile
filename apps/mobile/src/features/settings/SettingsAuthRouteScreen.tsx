import { StackActions, useNavigation } from "@react-navigation/native";
import { useEffect, useLayoutEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";

import { useCloudAuth } from "../cloud/CloudAuthProvider";
import { hasCloudPublicConfig } from "../cloud/publicConfig";
import { T3ConnectProfilePage, T3ConnectSignInPage } from "../cloud/T3ConnectProfilePage";

export function SettingsAuthRouteScreen() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    if (!hasCloudPublicConfig()) {
      navigation.dispatch(StackActions.replace("SettingsContent"));
    }
  }, [navigation]);

  return hasCloudPublicConfig() ? <ConfiguredSettingsAuthRouteScreen /> : null;
}

function ConfiguredSettingsAuthRouteScreen() {
  const { isLoaded, isSignedIn } = useCloudAuth();
  const navigation = useNavigation();
  const handleHostBack = () => navigation.dispatch(StackActions.popTo("SettingsContent"));
  // Once signed in, stay on the profile view so signing out pops back instead of
  // flashing the sign-in page.
  const [hasBeenSignedIn, setHasBeenSignedIn] = useState(isSignedIn === true);
  if (isSignedIn && !hasBeenSignedIn) setHasBeenSignedIn(true);

  useEffect(() => {
    if (hasBeenSignedIn && isLoaded && isSignedIn === false) {
      navigation.dispatch(StackActions.popTo("SettingsContent"));
    }
  }, [hasBeenSignedIn, isLoaded, isSignedIn, navigation]);

  return (
    <View collapsable={false} className="flex-1 overflow-hidden bg-sheet">
      {/* The sheet stack hides the header on this route, so the page draws its own back button. */}
      <View className="flex-row bg-account-page px-4 pt-4">
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={handleHostBack}
          className="size-[30px] items-center justify-center active:opacity-60"
        >
          <SymbolView
            name="chevron.left"
            size={18}
            tintColorClassName={"accent-account-foreground"}
            type="monochrome"
          />
        </Pressable>
      </View>
      {isLoaded ? hasBeenSignedIn ? <T3ConnectProfilePage /> : <T3ConnectSignInPage /> : null}
    </View>
  );
}
