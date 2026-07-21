using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KitapTanitimSitesi.Migrations
{
    /// <inheritdoc />
    public partial class AddModerationAndReportingSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BookRatings_BookID_UserID",
                table: "BookRatings");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "BookRatings",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DeletedByAdminId",
                table: "BookRatings",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FlaggedText",
                table: "BookRatings",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "BookRatings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "Reports",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Type = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    TargetRatingID = table.Column<int>(type: "int", nullable: true),
                    ReporterUserID = table.Column<int>(type: "int", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(max)", maxLength: 5000, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    AdminNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    UserMessage = table.Column<string>(type: "nvarchar(max)", maxLength: 5000, nullable: true),
                    ReviewedByAdminId = table.Column<int>(type: "int", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Reports_BookRatings_TargetRatingID",
                        column: x => x.TargetRatingID,
                        principalTable: "BookRatings",
                        principalColumn: "RatingID",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reports_Users_ReporterUserID",
                        column: x => x.ReporterUserID,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Reports_Users_ReviewedByAdminId",
                        column: x => x.ReviewedByAdminId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserModerationActions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UserID = table.Column<int>(type: "int", nullable: false),
                    ActionType = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    RelatedRatingID = table.Column<int>(type: "int", nullable: true),
                    RelatedReportID = table.Column<int>(type: "int", nullable: true),
                    StartDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    EndDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedByAdminId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserModerationActions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserModerationActions_BookRatings_RelatedRatingID",
                        column: x => x.RelatedRatingID,
                        principalTable: "BookRatings",
                        principalColumn: "RatingID",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserModerationActions_Reports_RelatedReportID",
                        column: x => x.RelatedReportID,
                        principalTable: "Reports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserModerationActions_Users_CreatedByAdminId",
                        column: x => x.CreatedByAdminId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserModerationActions_Users_UserID",
                        column: x => x.UserID,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookRatings_BookID_UserID",
                table: "BookRatings",
                columns: new[] { "BookID", "UserID" },
                unique: true,
                filter: "[IsDeleted] = 0");

            migrationBuilder.CreateIndex(
                name: "IX_BookRatings_DeletedByAdminId",
                table: "BookRatings",
                column: "DeletedByAdminId");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_ReporterUserID",
                table: "Reports",
                column: "ReporterUserID");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_ReviewedByAdminId",
                table: "Reports",
                column: "ReviewedByAdminId");

            migrationBuilder.CreateIndex(
                name: "IX_Reports_TargetRatingID",
                table: "Reports",
                column: "TargetRatingID");

            migrationBuilder.CreateIndex(
                name: "IX_UserModerationActions_CreatedByAdminId",
                table: "UserModerationActions",
                column: "CreatedByAdminId");

            migrationBuilder.CreateIndex(
                name: "IX_UserModerationActions_RelatedRatingID",
                table: "UserModerationActions",
                column: "RelatedRatingID");

            migrationBuilder.CreateIndex(
                name: "IX_UserModerationActions_RelatedReportID",
                table: "UserModerationActions",
                column: "RelatedReportID");

            migrationBuilder.CreateIndex(
                name: "IX_UserModerationActions_UserID",
                table: "UserModerationActions",
                column: "UserID");

            migrationBuilder.AddForeignKey(
                name: "FK_BookRatings_Users_DeletedByAdminId",
                table: "BookRatings",
                column: "DeletedByAdminId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BookRatings_Users_DeletedByAdminId",
                table: "BookRatings");

            migrationBuilder.DropTable(
                name: "UserModerationActions");

            migrationBuilder.DropTable(
                name: "Reports");

            migrationBuilder.DropIndex(
                name: "IX_BookRatings_BookID_UserID",
                table: "BookRatings");

            migrationBuilder.DropIndex(
                name: "IX_BookRatings_DeletedByAdminId",
                table: "BookRatings");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "BookRatings");

            migrationBuilder.DropColumn(
                name: "DeletedByAdminId",
                table: "BookRatings");

            migrationBuilder.DropColumn(
                name: "FlaggedText",
                table: "BookRatings");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "BookRatings");

            migrationBuilder.CreateIndex(
                name: "IX_BookRatings_BookID_UserID",
                table: "BookRatings",
                columns: new[] { "BookID", "UserID" },
                unique: true);
        }
    }
}
