import { Body, Controller, Delete, Headers, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { EstimateDto, IssueDetailsDto, ImportIssuesDto } from "../common/request-dtos";
import { ActiveIssueDto, NextActiveIssueDto } from "./issue.dto";
import { IssuesService } from "./issues.service";

@Controller("api")
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Post("rooms/:room/issues")
  create(
    @Param("room") room: string,
    @Body() body: IssueDetailsDto,
    @Headers("x-host-token") hostToken?: string,
  ) {
    return this.issues.create(room, body, hostToken);
  }

  @Post("rooms/:room/issues/import")
  import(
    @Param("room") room: string,
    @Body() body: ImportIssuesDto,
    @Headers("x-host-token") hostToken?: string,
  ) {
    return this.issues.import(room, body, hostToken);
  }

  @Patch("issues/:issue")
  update(
    @Param("issue") issue: string,
    @Body() body: IssueDetailsDto,
    @Headers("x-host-token") hostToken?: string,
  ) {
    return this.issues.update(issue, body, hostToken);
  }

  @Delete("rooms/:room/issues/:issue")
  @HttpCode(204)
  async remove(
    @Param("room") room: string,
    @Param("issue") issue: string,
    @Query() query: Record<string, unknown>,
    @Headers("x-host-token") hostToken?: string,
  ): Promise<void> {
    const hasNext = Object.prototype.hasOwnProperty.call(query, "next_active_issue_id");
    await this.issues.remove(room, issue, hasNext, firstQueryValue(query["next_active_issue_id"]), hostToken);
  }

  @Patch("rooms/:room/issues/:issue/archive")
  archive(
    @Param("room") room: string,
    @Param("issue") issue: string,
    @Body() body: NextActiveIssueDto,
    @Headers("x-host-token") hostToken?: string,
  ) {
    return this.issues.archive(room, issue, body.nextActiveIssueId, hostToken);
  }

  @Post("rooms/:room/issues/archive-estimated")
  @HttpCode(200)
  archiveEstimated(
    @Param("room") room: string,
    @Body() body: NextActiveIssueDto,
    @Headers("x-host-token") hostToken?: string,
  ) {
    return this.issues.archiveEstimated(room, body.nextActiveIssueId, hostToken);
  }

  @Patch("rooms/:room/issues/:issue/unarchive")
  unarchive(
    @Param("room") room: string,
    @Param("issue") issue: string,
    @Headers("x-host-token") hostToken?: string,
  ) {
    return this.issues.unarchive(room, issue, hostToken);
  }

  @Patch("rooms/:room/active-issue")
  @HttpCode(204)
  async setActive(
    @Param("room") room: string,
    @Body() body: ActiveIssueDto,
    @Headers("x-host-token") hostToken?: string,
  ): Promise<void> {
    await this.issues.setActive(room, body.issueId, hostToken);
  }

  @Patch("issues/:issue/estimate")
  @HttpCode(204)
  async setEstimate(
    @Param("issue") issue: string,
    @Body() body: EstimateDto,
    @Headers("x-host-token") hostToken?: string,
  ): Promise<void> {
    await this.issues.setEstimate(issue, body.value, hostToken);
  }
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}
