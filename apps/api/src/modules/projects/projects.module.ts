import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { TaskCategoriesController } from "./task-categories.controller";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController, TaskCategoriesController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
