import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { loadDatabaseConfig } from "./config/database.config";
import { CoreModule } from "./database/core.module";
import { DocsController } from "./docs/docs.controller";
import { HealthController } from "./health/health.controller";
import { IssuesModule } from "./issues/issues.module";
import { ParticipantsModule } from "./participants/participants.module";
import { RoomsModule } from "./rooms/rooms.module";
import { VotesModule } from "./votes/votes.module";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => loadDatabaseConfig().options,
    }),
    CoreModule,
    RoomsModule,
    ParticipantsModule,
    IssuesModule,
    VotesModule,
  ],
  controllers: [HealthController, DocsController],
})
export class AppModule {}
