using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KitapTanitimSitesi.Migrations
{
    /// <inheritdoc />
    public partial class MakePublicIdRequiredAndUnique : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_PublicId",
                table: "Users");

            migrationBuilder.AlterColumn<string>(
                name: "PublicId",
                table: "Users",
                type: "nvarchar(9)",
                maxLength: 9,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(9)",
                oldMaxLength: 9,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_PublicId",
                table: "Users",
                column: "PublicId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_PublicId",
                table: "Users");

            migrationBuilder.AlterColumn<string>(
                name: "PublicId",
                table: "Users",
                type: "nvarchar(9)",
                maxLength: 9,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(9)",
                oldMaxLength: 9);

            migrationBuilder.CreateIndex(
                name: "IX_Users_PublicId",
                table: "Users",
                column: "PublicId",
                unique: true,
                filter: "[PublicId] IS NOT NULL");
        }
    }
}
