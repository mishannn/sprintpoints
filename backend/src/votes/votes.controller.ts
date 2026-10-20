import { Body, Controller, Delete, Headers, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { VoteDto } from "../common/request-dtos";
import { VotesService } from "./votes.service";

@Controller("api")
export class VotesController {
  constructor(private readonly votes: VotesService) {}

  @Put("rooms/:room/issues/:issue/votes/:participant")
  @HttpCode(204)
  async cast(
    @Param("room") room: string,
    @Param("issue") issue: string,
    @Param("participant") participant: string,
    @Body() body: VoteDto,
    @Headers("x-participant-token") participantToken?: string,
  ): Promise<void> {
    await this.votes.cast(room, issue, participant, body, participantToken);
  }

  @Patch("rooms/:room/reveal")
  @HttpCode(204)
  async reveal(@Param("room") room: string, @Headers("x-host-token") hostToken?: string): Promise<void> {
    await this.votes.reveal(room, hostToken);
  }

  @Post("rooms/:room/issues/:issue/reset-votes")
  @HttpCode(204)
  async reset(
    @Param("room") room: string,
    @Param("issue") issue: string,
    @Headers("x-host-token") hostToken?: string,
  ): Promise<void> {
    await this.votes.reset(room, issue, hostToken);
  }

  @Delete("issues/:issue/votes/:participant")
  @HttpCode(204)
  async deleteVote(
    @Param("issue") issue: string,
    @Param("participant") participant: string,
    @Headers("x-participant-token") participantToken?: string,
  ): Promise<void> {
    await this.votes.deleteVote(issue, participant, participantToken);
  }
}
