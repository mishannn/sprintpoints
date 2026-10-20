import { Body, Controller, Delete, Headers, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { UpdateParticipantDto } from "../common/request-dtos";
import { ParticipantsService } from "./participants.service";

@Controller("api")
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Post("participants/:participant/heartbeat")
  @HttpCode(204)
  async heartbeat(
    @Param("participant") participant: string,
    @Headers("x-participant-token") participantToken?: string,
  ): Promise<void> {
    await this.participants.heartbeat(participant, participantToken);
  }

  @Patch("participants/:participant")
  update(
    @Param("participant") participant: string,
    @Body() body: UpdateParticipantDto,
    @Headers("x-participant-token") participantToken?: string,
  ) {
    return this.participants.update(participant, body, participantToken);
  }

  @Delete("rooms/:room/participants/:participant")
  @HttpCode(204)
  async remove(
    @Param("room") room: string,
    @Param("participant") participant: string,
    @Headers("x-host-token") hostToken?: string,
  ): Promise<void> {
    await this.participants.remove(room, participant, hostToken);
  }
}
