import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

export class CreateRoomDefaultsDto {
  @IsDefined()
  @IsString()
  facilitatorName: string;

  @IsDefined()
  @IsString()
  firstStoryTitle: string;

  @IsDefined()
  @IsString()
  roomName: string;
}

export class CreateRoomDto {
  @IsDefined()
  @IsString()
  roomName: string;

  @IsDefined()
  @IsString()
  participantName: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateRoomDefaultsDto)
  defaults: CreateRoomDefaultsDto;
}

export class JoinRoomDto {
  @IsDefined()
  @IsString()
  name: string;

  @IsDefined()
  @IsBoolean()
  isSpectator: boolean;
}

export class TransferOwnershipDto {
  @IsDefined()
  @IsString()
  participantId: string;
}

export class UpdateParticipantDto {
  @IsDefined()
  @IsBoolean()
  isSpectator: boolean;
}

export class IssueDetailsDto {
  @IsDefined()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  link?: string | null;
}

export class ImportIssueDto extends IssueDetailsDto {
  @IsOptional()
  @IsString()
  estimate?: string | null;
}

export class ImportIssuesDto {
  @IsDefined()
  @IsArray()
  @Type(() => ImportIssueDto)
  @ValidateNested({ each: true })
  issues: ImportIssueDto[];
}

export class VoteDto {
  @IsDefined()
  @IsString()
  value: string;
}

export class EstimateDto {
  @IsDefined()
  @IsString()
  value: string;
}
