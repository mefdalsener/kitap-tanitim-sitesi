using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KitapTanitimSitesi.Migrations
{
    /// <inheritdoc />
    public partial class AddCommentToBookRating : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Comment",
                table: "BookRatings",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "BookRatings",
                type: "datetime2",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Comment",
                table: "BookRatings");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "BookRatings");
        }
    }
}
