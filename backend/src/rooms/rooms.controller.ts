import { Body, Controller, Get, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { CreateRoomDto, JoinRoomDto, TransferOwnershipDto } from "../common/request-dtos";
import { RoomsService } from "./rooms.service";

@Controller("api/rooms")
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  create(@Body() body: CreateRoomDto) {
    return this.rooms.create(body);
  }

  @Post(":room/join")
  join(@Param("room") room: string, @Body() body: JoinRoomDto) {
    return this.rooms.join(room, body);
  }

  @Get(":room")
  load(
    @Param("room") room: string,
    @Headers("x-participant-token") participantToken?: string,
    @Headers("x-host-token") hostToken?: string,
  ) {
    return this.rooms.load(room, participantToken, hostToken);
  }

  @Post(":room/transfer-ownership")
  @HttpCode(204)
  async transferOwnership(
    @Param("room") room: string,
    @Body() body: TransferOwnershipDto,
    @Headers("x-host-token") hostToken?: string,
  ): Promise<void> {
    await this.rooms.transferOwnership(room, body, hostToken);
  }
}
