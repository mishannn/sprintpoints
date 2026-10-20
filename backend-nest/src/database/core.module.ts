import { Global, Module } from "@nestjs/common";
import { RoomAccessService } from "./room-access.service";
import { UnitOfWork } from "./unit-of-work.service";
import { RoomHub } from "../realtime/room-hub.service";

@Global()
@Module({
  providers: [RoomAccessService, UnitOfWork, RoomHub],
  exports: [RoomAccessService, UnitOfWork, RoomHub],
})
export class CoreModule {}
