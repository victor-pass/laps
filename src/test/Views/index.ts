import { ChooseRaceView } from "./ChooseRaceView";
import { ConfirmRaceView } from "./ConfirmRaceView";
import { CreateRaceView } from "./CreateRaceView";
import { DevicesView } from "./DevicesView";
import { JoinRaceView } from "./JoinRaceView";
import { LapCountsView } from "./LapCountsView";
import { MenuView } from "./MenuView";
import { PopupView } from "./PopupView";
import { RaceQRView } from "./RaceQRView";
import { viewAccessor } from "./View";

export const loadViews = ({ container }: { container: HTMLElement }) => ({
  lapCounts: viewAccessor(container, LapCountsView),
  devices: viewAccessor(container, DevicesView),
  popup: viewAccessor(container, PopupView),
  raceQr: viewAccessor(container, RaceQRView),
  chooseRace: viewAccessor(container, ChooseRaceView),
  confirmRace: viewAccessor(container, ConfirmRaceView),
  createRace: viewAccessor(container, CreateRaceView),
  menu: viewAccessor(container, MenuView),
  joinRace: viewAccessor(container, JoinRaceView),
});
