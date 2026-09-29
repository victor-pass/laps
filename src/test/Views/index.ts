import { ChooseRaceView } from "./ChooseRaceView";
import { ConfirmRaceView } from "./ConfirmRaceView";
import { CreateRaceView } from "./CreateRaceView";
import { DevicesView } from "./DevicesView";
import { LapsView } from "./LapsView";
import { PopupView } from "./PopupView";
import { SelectedRaceQRView } from "./SelectedRaceQRView";
import { viewAccessor } from "./View";

export const loadViews = ({ container }: { container: HTMLElement }) => ({
  laps: viewAccessor(container, LapsView),
  devices: viewAccessor(container, DevicesView),
  popup: viewAccessor(container, PopupView),
  selectedRaceQr: viewAccessor(container, SelectedRaceQRView),
  chooseRace: viewAccessor(container, ChooseRaceView),
  confirmRace: viewAccessor(container, ConfirmRaceView),
  createRace: viewAccessor(container, CreateRaceView),
});
